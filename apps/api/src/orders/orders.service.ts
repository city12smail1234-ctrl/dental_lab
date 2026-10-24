import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { attachDoctors } from '../common/doctor-info';
import { CartService } from '../cart/cart.service';
import { sniff } from '../products/products.service';
import { SettingsService } from '../settings/settings.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AddressDto, CreateOrderDto } from './dto';

const MSG: Record<string, string> = {
  empty_cart: 'Your cart is empty', doctor_not_approved: 'Your account is not approved yet',
  insufficient_stock: 'Not enough stock for', product_unavailable: 'Product no longer available:', below_min: 'Below the minimum order quantity for',
  invalid_transition: 'This status change is not allowed', order_not_found: 'Order not found',
};
const WITH_SKU = ['insufficient_stock', 'product_unavailable', 'below_min'];
const TRANSFER = ['vodafone_cash', 'instapay'];
const DETAIL = '*, order_items(*), order_status_history(*)';

@Injectable()
export class OrdersService {
  constructor(private readonly sb: SupabaseService, private readonly cart: CartService, private readonly settings: SettingsService) {}

  private rpcError(msg: string): never {
    const key = Object.keys(MSG).find((k) => msg.includes(k));
    const sku = msg.split(':')[1]?.trim();
    throw new BadRequestException(key ? `${MSG[key]}${WITH_SKU.includes(key) && sku ? ' ' + sku : ''}` : msg);
  }
  private fee(subtotal: number, d: { flat_fee: number; free_over: number | null }) {
    return d.free_over != null && subtotal >= d.free_over ? 0 : d.flat_fee;
  }
  private audit(actor: string, action: string, id: string, details: object) {
    return this.sb.admin.from('audit_logs').insert({ actor_id: actor, action, entity: 'orders', entity_id: id, details });
  }

  // ---------- doctor ----------
  async checkout(userId: string) {
    const [s, cart, addr, prof, doc] = await Promise.all([
      this.settings.getAll(), this.cart.get(userId),
      this.sb.admin.from('clinic_addresses').select('id,label,address_line,city,phone').eq('doctor_id', userId).order('created_at'),
      this.sb.admin.from('profiles').select('phone').eq('id', userId).maybeSingle(),
      this.sb.admin.from('doctor_profiles').select('status,clinic_address').eq('user_id', userId).maybeSingle(),
    ]);
    const methods: { id: string; number?: string; handle?: string; name?: string }[] = [];
    if (s.payments.cod.enabled) methods.push({ id: 'cod' });
    if (s.payments.account?.enabled) methods.push({ id: 'account' });
    if (s.payments.vodafone_cash.enabled) methods.push({ id: 'vodafone_cash', number: s.payments.vodafone_cash.number, name: s.payments.vodafone_cash.name });
    if (s.payments.instapay.enabled) methods.push({ id: 'instapay', handle: s.payments.instapay.handle, name: s.payments.instapay.name });
    const fee = cart.items.length ? this.fee(cart.subtotal, s.delivery) : 0;
    return {
      methods, subtotal: cart.subtotal, delivery_fee: fee, total: (Math.round(cart.subtotal * 100) + Math.round(fee * 100)) / 100,
      addresses: addr.data ?? [], phone: prof.data?.phone ?? '', default_address: doc.data?.clinic_address ?? '',
      approved: doc.data?.status === 'approved', items_count: cart.items.length, has_issues: cart.items.some((i) => i.issue),
    };
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const s = await this.settings.getAll();
    const enabled = (s.payments as any)[dto.payment_method]?.enabled;
    if (!enabled) throw new BadRequestException('This payment method is not available');

    const { data, error } = await this.sb.admin.rpc('create_order', {
      p_user: userId, p_key: dto.idempotency_key, p_method: dto.payment_method, p_phone: dto.phone, p_address: dto.address.trim(),
      p_instr: dto.delivery_instructions ?? null, p_notes: dto.notes ?? null, p_flat_fee: s.delivery.flat_fee, p_free_over: s.delivery.free_over,
    });
    let id = data as string | null;
    if (error) {
      if (error.code !== '23505') this.rpcError(error.message);
      const { data: ex } = await this.sb.admin.from('orders').select('id').eq('doctor_id', userId).eq('idempotency_key', dto.idempotency_key).maybeSingle();
      id = ex?.id ?? null; // same request submitted twice: return the original order
    }
    if (!id) throw new BadRequestException('Could not create the order');
    if (dto.save_address) await this.sb.admin.from('clinic_addresses').insert({ doctor_id: userId, address_line: dto.address.trim(), phone: dto.phone });
    const { data: o } = await this.sb.admin.from('orders').select('id,order_number').eq('id', id).single();
    return o;
  }

  async myOrders(userId: string) {
    const { data, error } = await this.sb.admin.from('orders').select('id,order_number,status,payment_method,payment_status,total,created_at,due_at,order_items(name_ar,name_en,quantity)').eq('doctor_id', userId).order('created_at', { ascending: false }).limit(100);
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async myOrder(userId: string, id: string) {
    const { data, error } = await this.sb.admin.from('orders').select(`${DETAIL}, payments(id,status,reference,created_at)`).eq('id', id).eq('doctor_id', userId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException(); // also hides other doctors' orders
    return data;
  }

  async cancelMine(userId: string, id: string) {
    const o = await this.myOrder(userId, id);
    if (o.status !== 'pending') throw new BadRequestException('Only pending orders can be cancelled');
    const { error } = await this.sb.admin.rpc('set_order_status', { p_order: id, p_status: 'cancelled', p_note: 'Cancelled by doctor', p_user: userId });
    if (error) this.rpcError(error.message);
    return this.myOrder(userId, id);
  }

  async submitProof(userId: string, id: string, reference: string, file?: Express.Multer.File) {
    const o = await this.myOrder(userId, id);
    if (!TRANSFER.includes(o.payment_method)) throw new BadRequestException('This order is not paid by transfer');
    if (o.status === 'cancelled') throw new BadRequestException('Order is cancelled');
    if (!['unpaid', 'rejected'].includes(o.payment_status)) throw new BadRequestException('Payment already submitted or confirmed');
    if (!file) throw new BadRequestException('Receipt image is required');
    const type = sniff(file.buffer);
    if (!type) throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');

    const path = `${userId}/${id}/${randomUUID()}.${type.ext}`;
    const up = await this.sb.admin.storage.from('payment-proofs').upload(path, file.buffer, { contentType: type.mime, upsert: false });
    if (up.error) throw new BadRequestException(up.error.message);
    const ins = await this.sb.admin.from('payments').insert({ order_id: id, method: o.payment_method, amount: o.total, reference, proof_path: path });
    if (ins.error) { await this.sb.admin.storage.from('payment-proofs').remove([path]); throw new BadRequestException(ins.error.message); }
    await this.sb.admin.from('orders').update({ payment_status: 'awaiting_confirmation' }).eq('id', id);
    return this.myOrder(userId, id);
  }

  // ---------- addresses ----------
  async addresses(userId: string) {
    const { data } = await this.sb.admin.from('clinic_addresses').select('*').eq('doctor_id', userId).order('created_at');
    return data ?? [];
  }
  async addAddress(userId: string, dto: AddressDto) {
    const { error } = await this.sb.admin.from('clinic_addresses').insert({ ...dto, doctor_id: userId });
    if (error) throw new BadRequestException(error.message);
    return this.addresses(userId);
  }
  async deleteAddress(userId: string, id: string) {
    await this.sb.admin.from('clinic_addresses').delete().eq('id', id).eq('doctor_id', userId);
    return this.addresses(userId);
  }

  // ---------- admin ----------
  async adminList(status: string | undefined, search: string | undefined, page: number) {
    const limit = 20;
    let q = this.sb.admin.from('orders').select('id,order_number,status,payment_method,payment_status,total,created_at,due_at,doctor_id,order_items(name_ar,name_en,quantity)', { count: 'exact' })
      .order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
    if (status) q = q.eq('status', status);
    const k = (search ?? '').replace(/[^A-Za-z0-9-]/g, '');
    if (k) q = q.ilike('order_number', `%${k}%`);
    const { data, count, error } = await q;
    if (error) throw new BadRequestException(error.message);
    return { items: await attachDoctors(this.sb, data ?? []), total: count ?? 0, page, limit };
  }

  async adminGet(id: string) {
    const { data, error } = await this.sb.admin.from('orders').select(`${DETAIL}, profiles(full_name,email,phone), payments(*)`).eq('id', id).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException();
    const payments = await Promise.all((data.payments ?? []).map(async (p: any) => {
      const signed = p.proof_path ? await this.sb.admin.storage.from('payment-proofs').createSignedUrl(p.proof_path, 600) : null;
      const { proof_path, ...rest } = p;
      return { ...rest, proof_url: signed?.data?.signedUrl ?? null };   // short-lived link, never a public URL
    }));
    const [withDoctor] = await attachDoctors(this.sb, [data]);
    return { ...withDoctor, payments };
  }

  async adminSetStatus(userId: string, id: string, status: string, note?: string) {
    const { error } = await this.sb.admin.rpc('set_order_status', { p_order: id, p_status: status, p_note: note ?? null, p_user: userId });
    if (error) this.rpcError(error.message);
    await this.audit(userId, 'order.status_changed', id, { to: status });
    return this.adminGet(id);
  }

  async adminPayment(userId: string, id: string, action: string) {
    const o = await this.adminGet(id);
    const pending = o.payments.find((p: any) => p.status === 'pending');
    const now = new Date().toISOString();
    if (action === 'confirm') {
      if (pending) await this.sb.admin.from('payments').update({ status: 'confirmed', reviewed_by: userId, reviewed_at: now }).eq('id', pending.id);
      else await this.sb.admin.from('payments').insert({ order_id: id, method: o.payment_method, amount: o.total, status: 'confirmed', reviewed_by: userId, reviewed_at: now });
      await this.sb.admin.from('orders').update({ payment_status: 'paid' }).eq('id', id);
    } else if (action === 'reject') {
      if (!pending) throw new BadRequestException('No pending receipt to reject');
      await this.sb.admin.from('payments').update({ status: 'rejected', reviewed_by: userId, reviewed_at: now }).eq('id', pending.id);
      await this.sb.admin.from('orders').update({ payment_status: 'rejected' }).eq('id', id);
    } else {
      await this.sb.admin.from('orders').update({ payment_status: 'unpaid' }).eq('id', id);
    }
    await this.audit(userId, `order.payment_${action}`, id, {});
    return this.adminGet(id);
  }

  /** Sets (or clears) the delivery deadline, counted from now. The doctor sees a live countdown. */
  async adminSetDue(userId: string, id: string, hours: number | null) {
    const due = hours === null ? null : new Date(Date.now() + hours * 3_600_000).toISOString();
    const { error } = await this.sb.admin.from('orders').update({ due_at: due }).eq('id', id);
    if (error) throw new BadRequestException(error.message);
    await this.audit(userId, 'order.due_set', id, { hours });
    return this.adminGet(id);
  }
}
