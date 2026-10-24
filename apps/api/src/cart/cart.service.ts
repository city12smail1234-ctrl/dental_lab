import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CartService {
  constructor(private readonly sb: SupabaseService) {}

  private url(path: string) { return this.sb.admin.storage.from('product-images').getPublicUrl(path).data.publicUrl; }

  /** Cart lines priced from the database (never from the browser). Money is summed in piasters to avoid float drift. */
  async get(userId: string) {
    const { data, error } = await this.sb.admin
      .from('cart_items')
      .select('quantity, products(id,sku,name_ar,name_en,price,discount_price,stock_quantity,min_order_qty,is_active,product_images(storage_path,is_primary,sort_order))')
      .eq('user_id', userId)
      .order('created_at');
    if (error) throw new BadRequestException(error.message);

    let cents = 0;
    const items = (data ?? []).map((row: any) => {
      const p = row.products;
      const unit = Number(p.discount_price ?? p.price);
      const issue = !p.is_active ? 'unavailable' : p.stock_quantity < row.quantity ? 'stock' : null;
      const lineCents = Math.round(unit * 100) * row.quantity;
      if (issue !== 'unavailable') cents += lineCents;
      const img = [...(p.product_images ?? [])].sort((a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)[0];
      return {
        product_id: p.id, sku: p.sku, name_ar: p.name_ar, name_en: p.name_en, unit_price: unit, list_price: Number(p.price),
        quantity: row.quantity, line_total: lineCents / 100, stock_quantity: p.stock_quantity, min_order_qty: p.min_order_qty,
        image: img ? this.url(img.storage_path) : null, issue,
      };
    });
    return { items, subtotal: cents / 100 };
  }

  async setItem(userId: string, productId: string, quantity: number) {
    const { data: p } = await this.sb.admin.from('products').select('is_active,stock_quantity,min_order_qty').eq('id', productId).maybeSingle();
    if (!p || !p.is_active) throw new NotFoundException('Product not available');
    if (quantity < p.min_order_qty) throw new BadRequestException(`Minimum order quantity is ${p.min_order_qty}`);
    if (quantity > p.stock_quantity) throw new BadRequestException(`Only ${p.stock_quantity} in stock`);
    const { error } = await this.sb.admin.from('cart_items').upsert({ user_id: userId, product_id: productId, quantity }, { onConflict: 'user_id,product_id' });
    if (error) throw new BadRequestException(error.message);
    return this.get(userId);
  }

  async remove(userId: string, productId: string) {
    await this.sb.admin.from('cart_items').delete().eq('user_id', userId).eq('product_id', productId);
    return this.get(userId);
  }

  async clear(userId: string) {
    await this.sb.admin.from('cart_items').delete().eq('user_id', userId);
    return { items: [], subtotal: 0 };
  }
}
