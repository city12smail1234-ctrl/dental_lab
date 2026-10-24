import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { AdjustStockDto, CreateProductCategoryDto, CreateProductDto, UpdateProductCategoryDto, UpdateProductDto } from './dto';

const BUCKET = 'product-images';
const SELECT = '*, product_images(id,storage_path,is_primary,sort_order)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Detect the real file type from its first bytes; never trust the client's mimetype alone.
export function sniff(b: Buffer): { ext: string; mime: string } | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

@Injectable()
export class ProductsService {
  constructor(private readonly sb: SupabaseService) {}

  private fail(e: { message: string; code?: string }): never {
    if (e.code === '23505') throw new ConflictException('SKU already exists');
    throw new BadRequestException(e.message);
  }
  private url(path: string) { return this.sb.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl; }
  private shape(p: any) {
    const { product_images, ...rest } = p;
    const images = (product_images ?? [])
      .sort((a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
      .map((i: any) => ({ id: i.id, url: this.url(i.storage_path), is_primary: i.is_primary }));
    return { ...rest, images, in_stock: rest.stock_quantity > 0 };
  }
  private audit(actor: string, action: string, id: string, details: object) {
    return this.sb.admin.from('audit_logs').insert({ actor_id: actor, action, entity: 'products', entity_id: id, details });
  }

  // ---- categories ----
  async categories(onlyActive: boolean) {
    let q = this.sb.admin.from('product_categories').select('*').order('sort_order');
    if (onlyActive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) this.fail(error);
    return data;
  }
  async createCategory(actor: string, dto: CreateProductCategoryDto) {
    const { data, error } = await this.sb.admin.from('product_categories').insert(dto).select().single();
    if (error) this.fail(error);
    await this.sb.admin.from('audit_logs').insert({ actor_id: actor, action: 'product_category.created', entity: 'product_categories', entity_id: data.id, details: dto });
    return data;
  }
  async updateCategory(actor: string, id: string, dto: UpdateProductCategoryDto) {
    if (dto.parent_id === id) throw new BadRequestException('A category cannot be its own parent');
    const { data, error } = await this.sb.admin.from('product_categories').update(dto).eq('id', id).select().maybeSingle();
    if (error) this.fail(error);
    if (!data) throw new NotFoundException();
    await this.sb.admin.from('audit_logs').insert({ actor_id: actor, action: 'product_category.updated', entity: 'product_categories', entity_id: id, details: dto });
    return data;
  }
  /** Only an empty category can be deleted; otherwise deactivate it (old orders keep their history either way). */
  async deleteCategory(actor: string, id: string) {
    const [p, c] = await Promise.all([
      this.sb.admin.from('products').select('*', { count: 'exact', head: true }).eq('category_id', id),
      this.sb.admin.from('product_categories').select('*', { count: 'exact', head: true }).eq('parent_id', id),
    ]);
    if ((p.count ?? 0) > 0 || (c.count ?? 0) > 0) throw new BadRequestException('This category is in use. Deactivate it instead, or move its products first.');
    const { error } = await this.sb.admin.from('product_categories').delete().eq('id', id);
    if (error) this.fail(error);
    await this.sb.admin.from('audit_logs').insert({ actor_id: actor, action: 'product_category.deleted', entity: 'product_categories', entity_id: id, details: {} });
    return { deleted: true };
  }

  // ---- listing ----
  async list(opts: { search?: string; category?: string; sort?: string; page: number; admin: boolean }) {
    const limit = 20;
    let q = this.sb.admin.from('products').select(SELECT, { count: 'exact' }).range((opts.page - 1) * limit, opts.page * limit - 1);
    if (!opts.admin) q = q.eq('is_active', true);
    if (opts.category && UUID.test(opts.category)) q = q.eq('category_id', opts.category);
    const k = (opts.search ?? '').replace(/[,()%*\\]/g, ' ').trim();
    if (k) q = q.or(`name_en.ilike.%${k}%,name_ar.ilike.%${k}%,sku.ilike.%${k}%`);
    q = opts.sort === 'price_asc' ? q.order('price') : opts.sort === 'price_desc' ? q.order('price', { ascending: false }) : q.order('created_at', { ascending: false });
    const { data, count, error } = await q;
    if (error) this.fail(error);
    return { items: (data ?? []).map((p) => this.shape(p)), total: count ?? 0, page: opts.page, limit };
  }

  async get(id: string, admin: boolean) {
    const { data, error } = await this.sb.admin.from('products').select(SELECT).eq('id', id).maybeSingle();
    if (error) this.fail(error);
    if (!data || (!admin && !data.is_active)) throw new NotFoundException();
    return this.shape(data);
  }

  // ---- admin writes ----
  async create(actor: string, dto: CreateProductDto) {
    const { initial_stock, ...row } = dto;
    if (row.discount_price != null && row.discount_price >= row.price) throw new BadRequestException('Discount price must be lower than price');
    const { data, error } = await this.sb.admin.from('products').insert(row).select().single();
    if (error) this.fail(error);
    if (initial_stock) await this.sb.admin.rpc('adjust_stock', { p_product: data.id, p_delta: initial_stock, p_reason: 'initial', p_note: null, p_user: actor });
    await this.audit(actor, 'product.created', data.id, { sku: data.sku, price: data.price });
    return this.get(data.id, true);
  }

  async update(actor: string, id: string, dto: UpdateProductDto) {
    const { data: cur } = await this.sb.admin.from('products').select('price,discount_price').eq('id', id).maybeSingle();
    if (!cur) throw new NotFoundException();
    const price = dto.price ?? Number(cur.price);
    const disc = dto.discount_price === undefined ? cur.discount_price : dto.discount_price;
    if (disc != null && Number(disc) >= price) throw new BadRequestException('Discount price must be lower than price');
    const { error } = await this.sb.admin.from('products').update(dto).eq('id', id);
    if (error) this.fail(error);
    if (dto.price !== undefined && Number(cur.price) !== dto.price) await this.audit(actor, 'product.price_changed', id, { from: cur.price, to: dto.price });
    return this.get(id, true);
  }

  async adjustStock(actor: string, id: string, dto: AdjustStockDto) {
    if (dto.delta === 0) throw new BadRequestException('Quantity change cannot be zero');
    const { data, error } = await this.sb.admin.rpc('adjust_stock', { p_product: id, p_delta: dto.delta, p_reason: dto.reason, p_note: dto.note ?? null, p_user: actor });
    if (error) throw new BadRequestException(error.message.includes('insufficient') ? 'Not enough stock for this change' : error.message);
    return { stock_quantity: data };
  }

  // ---- images ----
  async addImage(id: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    const type = sniff(file.buffer);
    if (!type) throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');
    const { data: p } = await this.sb.admin.from('products').select('id').eq('id', id).maybeSingle();
    if (!p) throw new NotFoundException();
    const { data: existing } = await this.sb.admin.from('product_images').select('id').eq('product_id', id);
    if ((existing?.length ?? 0) >= 6) throw new BadRequestException('Maximum 6 images per product');

    const path = `products/${id}/${randomUUID()}.${type.ext}`;
    const up = await this.sb.admin.storage.from(BUCKET).upload(path, file.buffer, { contentType: type.mime, upsert: false });
    if (up.error) throw new BadRequestException(up.error.message);
    const { error } = await this.sb.admin.from('product_images').insert({ product_id: id, storage_path: path, is_primary: !existing?.length, sort_order: existing?.length ?? 0 });
    if (error) { await this.sb.admin.storage.from(BUCKET).remove([path]); this.fail(error); }
    return this.get(id, true);
  }

  async removeImage(imageId: string) {
    const { data: img } = await this.sb.admin.from('product_images').select('*').eq('id', imageId).maybeSingle();
    if (!img) throw new NotFoundException();
    await this.sb.admin.storage.from(BUCKET).remove([img.storage_path]);
    await this.sb.admin.from('product_images').delete().eq('id', imageId);
    if (img.is_primary) {
      const { data: next } = await this.sb.admin.from('product_images').select('id').eq('product_id', img.product_id).order('sort_order').limit(1);
      if (next?.[0]) await this.sb.admin.from('product_images').update({ is_primary: true }).eq('id', next[0].id);
    }
    return this.get(img.product_id, true);
  }
}
