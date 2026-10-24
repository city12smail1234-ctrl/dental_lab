import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sniff } from '../products/products.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCategoryDto, CreateServiceDto, UpdateCategoryDto, UpdateServiceDto } from './dto';

@Injectable()
export class LabServicesService {
  constructor(private readonly sb: SupabaseService) {}

  private fail(e: { message: string }): never { throw new BadRequestException(e.message); }

  async list(onlyActive: boolean) {
    let c = this.sb.admin.from('lab_service_categories').select('*').order('sort_order');
    let s = this.sb.admin.from('lab_services').select('*').order('name_en');
    if (onlyActive) { c = c.eq('is_active', true); s = s.eq('is_active', true); }
    const [cr, sr] = await Promise.all([c, s]);
    if (cr.error) this.fail(cr.error);
    if (sr.error) this.fail(sr.error);
    return { categories: cr.data, services: sr.data.map((x) => this.shape(x)) };
  }

  async createCategory(actor: string, dto: CreateCategoryDto) {
    const { data, error } = await this.sb.admin.from('lab_service_categories').insert(dto).select().single();
    if (error) this.fail(error);
    await this.sb.admin.from('audit_logs').insert({ actor_id: actor, action: 'service_category.created', entity: 'lab_service_categories', entity_id: data.id, details: dto });
    return data;
  }

  async updateCategory(actor: string, id: string, dto: UpdateCategoryDto) {
    const { data, error } = await this.sb.admin.from('lab_service_categories').update(dto).eq('id', id).select().maybeSingle();
    if (error) this.fail(error);
    if (!data) throw new NotFoundException();
    await this.sb.admin.from('audit_logs').insert({ actor_id: actor, action: 'service_category.updated', entity: 'lab_service_categories', entity_id: id, details: dto });
    return data;
  }

  /** Only an empty category can be deleted; otherwise deactivate it. */
  async deleteCategory(actor: string, id: string) {
    const { count } = await this.sb.admin.from('lab_services').select('*', { count: 'exact', head: true }).eq('category_id', id);
    if ((count ?? 0) > 0) throw new BadRequestException('This category has services. Deactivate it instead, or move its services first.');
    const { error } = await this.sb.admin.from('lab_service_categories').delete().eq('id', id);
    if (error) this.fail(error);
    await this.sb.admin.from('audit_logs').insert({ actor_id: actor, action: 'service_category.deleted', entity: 'lab_service_categories', entity_id: id, details: {} });
    return { deleted: true };
  }

  private audit(actor: string, action: string, id: string, details: object) {
    return this.sb.admin.from('audit_logs').insert({ actor_id: actor, action, entity: 'lab_services', entity_id: id, details });
  }

  async createService(actor: string, dto: CreateServiceDto) {
    const { data, error } = await this.sb.admin.from('lab_services').insert(dto).select().single();
    if (error) this.fail(error);
    await this.audit(actor, 'lab_service.created', data.id, { price: data.price });
    return data;
  }

  async updateService(actor: string, id: string, dto: UpdateServiceDto) {
    const { data: cur } = await this.sb.admin.from('lab_services').select('price,is_active').eq('id', id).maybeSingle();
    if (!cur) throw new NotFoundException();
    const { data, error } = await this.sb.admin.from('lab_services').update(dto).eq('id', id).select().single();
    if (error) this.fail(error);
    if (dto.price !== undefined && Number(cur.price) !== dto.price)
      await this.audit(actor, 'lab_service.price_changed', id, { from: cur.price, to: dto.price });
    if (dto.is_active !== undefined && cur.is_active !== dto.is_active)
      await this.audit(actor, 'lab_service.active_changed', id, { to: dto.is_active });
    return data;
  }

  private shape(s: any) {
    const { image_path, ...rest } = s;
    return { ...rest, image_url: image_path ? this.sb.admin.storage.from('service-images').getPublicUrl(image_path).data.publicUrl : null };
  }

  async setImage(id: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    const type = sniff(file.buffer);
    if (!type) throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');
    const { data: cur } = await this.sb.admin.from('lab_services').select('image_path').eq('id', id).maybeSingle();
    if (!cur) throw new NotFoundException();
    const path = `services/${id}/${randomUUID()}.${type.ext}`;
    const up = await this.sb.admin.storage.from('service-images').upload(path, file.buffer, { contentType: type.mime, upsert: false });
    if (up.error) throw new BadRequestException(up.error.message);
    const { data, error } = await this.sb.admin.from('lab_services').update({ image_path: path }).eq('id', id).select().single();
    if (error) this.fail(error);
    if (cur.image_path) await this.sb.admin.storage.from('service-images').remove([cur.image_path]);
    return this.shape(data);
  }

  async clearImage(id: string) {
    const { data: cur } = await this.sb.admin.from('lab_services').select('image_path').eq('id', id).maybeSingle();
    if (!cur) throw new NotFoundException();
    if (cur.image_path) await this.sb.admin.storage.from('service-images').remove([cur.image_path]);
    const { data, error } = await this.sb.admin.from('lab_services').update({ image_path: null }).eq('id', id).select().single();
    if (error) this.fail(error);
    return this.shape(data);
  }
}
