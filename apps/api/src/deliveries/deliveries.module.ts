import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { attachDoctors } from '../common/doctor-info';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { SupabaseService } from '../supabase/supabase.service';

const STATUSES = ['confirmed', 'preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered', 'failed', 'rescheduled', 'cancelled'];
const MSG: Record<string, string> = { invalid_transition: 'This status change is not allowed', delivery_closed: 'This delivery is closed', delivery_not_found: 'Delivery not found' };

class DeliveryStatusDto {
  @IsIn(STATUSES) status: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsString() @MaxLength(100) received_by?: string;
}
class DeliveryUpdateDto {
  @IsOptional() @IsUUID() assigned_to?: string | null;
  @IsOptional() @IsDateString() scheduled_for?: string | null;
  @IsOptional() @IsString() @MaxLength(500) delivery_notes?: string | null;
}

@Injectable()
export class DeliveriesService {
  constructor(private readonly sb: SupabaseService) {}

  private isManager(u: AuthUser) { return ['super_admin', 'lab_manager', 'delivery_coordinator'].some((r) => u.roles.includes(r as never)); }
  private rpcError(m: string): never { const k = Object.keys(MSG).find((x) => m.includes(x)); throw new BadRequestException(k ? MSG[k] : m); }
  private audit(actor: string, action: string, id: string, details: object) {
    return this.sb.admin.from('audit_logs').insert({ actor_id: actor, action, entity: 'deliveries', entity_id: id, details });
  }

  // ---- doctor: only their own deliveries, no courier details ----
  async mine(userId: string, orderId?: string, caseId?: string) {
    let q = this.sb.admin.from('deliveries').select('id,reference,status,scheduled_for,delivered_at,received_by,created_at,order_id,case_id').eq('doctor_id', userId).order('created_at', { ascending: false }).limit(20);
    if (orderId) q = q.eq('order_id', orderId);
    if (caseId) q = q.eq('case_id', caseId);
    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    const ids = (data ?? []).map((d) => d.id);
    const { data: h } = ids.length ? await this.sb.admin.from('delivery_status_history').select('id,delivery_id,to_status,note,created_at').in('delivery_id', ids).order('id') : { data: [] };
    return (data ?? []).map((d) => ({ ...d, history: (h ?? []).filter((x: any) => x.delivery_id === d.id) }));
  }

  // ---- staff ----
  private async staffDelivery(u: AuthUser, id: string) {
    const { data: d, error } = await this.sb.admin.from('deliveries').select('*').eq('id', id).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!d) throw new NotFoundException();
    if (!this.isManager(u) && d.assigned_to !== u.id) throw new ForbiddenException('This delivery is not assigned to you'); // couriers: assigned only
    return d;
  }

  async list(u: AuthUser, status?: string, search?: string, page = 1) {
    const limit = 20;
    let q = this.sb.admin.from('deliveries').select('id,reference,status,address,fee,scheduled_for,assigned_to,created_at,order_id,case_id,doctor_id', { count: 'exact' })
      .order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
    if (!this.isManager(u)) q = q.eq('assigned_to', u.id);
    if (status) q = q.eq('status', status);
    const k = (search ?? '').replace(/[^A-Za-z0-9-]/g, '');
    if (k) q = q.ilike('reference', `%${k}%`);
    const { data, count, error } = await q;
    if (error) throw new BadRequestException(error.message);
    return { items: await attachDoctors(this.sb, data ?? []), total: count ?? 0, page, limit };
  }

  async get(u: AuthUser, id: string) {
    const d = await this.staffDelivery(u, id);
    const [h, p, o, c, courier] = await Promise.all([
      this.sb.admin.from('delivery_status_history').select('*').eq('delivery_id', id).order('id'),
      this.sb.admin.from('profiles').select('full_name,email,phone').eq('id', d.doctor_id).maybeSingle(),
      d.order_id ? this.sb.admin.from('orders').select('order_number,total,payment_method,payment_status').eq('id', d.order_id).maybeSingle() : Promise.resolve({ data: null }),
      d.case_id ? this.sb.admin.from('lab_cases').select('case_number').eq('id', d.case_id).maybeSingle() : Promise.resolve({ data: null }),
      d.assigned_to ? this.sb.admin.from('profiles').select('full_name,email').eq('id', d.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const [withDoctor] = await attachDoctors(this.sb, [d]);
    return { ...d, history: h.data ?? [], doctor: withDoctor.doctor ?? p.data, order: o.data, case: c.data, courier: courier.data };
  }

  async couriers() {
    const { data: r } = await this.sb.admin.from('user_roles').select('user_id').in('role', ['delivery_staff', 'delivery_coordinator', 'lab_manager', 'super_admin']);
    const ids = [...new Set((r ?? []).map((x) => x.user_id))];
    if (!ids.length) return [];
    const { data } = await this.sb.admin.from('profiles').select('id,full_name,email').in('id', ids);
    return data ?? [];
  }

  async setStatus(u: AuthUser, id: string, dto: DeliveryStatusDto) {
    await this.staffDelivery(u, id);
    if (dto.status === 'delivered' && !dto.received_by?.trim()) throw new BadRequestException('Enter who received the delivery (proof of delivery)');
    const { error } = await this.sb.admin.rpc('delivery_move', { p_id: id, p_status: dto.status, p_note: dto.note ?? null, p_user: u.id, p_force: false, p_received_by: dto.received_by?.trim() ?? null });
    if (error) this.rpcError(error.message);
    await this.audit(u.id, 'delivery.status_changed', id, { to: dto.status });
    return this.get(u, id);
  }

  async update(u: AuthUser, id: string, dto: DeliveryUpdateDto) {
    if (!this.isManager(u)) throw new ForbiddenException('Only coordinators and managers can assign or schedule');
    await this.staffDelivery(u, id);
    const { error } = await this.sb.admin.from('deliveries').update(dto).eq('id', id);
    if (error) throw new BadRequestException(error.message);
    await this.audit(u.id, 'delivery.updated', id, dto);
    return this.get(u, id);
  }
}

@ApiTags('deliveries')
@ApiBearerAuth()
@Roles('doctor')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly svc: DeliveriesService) {}
  @Get() mine(@CurrentUser() u: AuthUser, @Query('order_id') o?: string, @Query('case_id') c?: string) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return this.svc.mine(u.id, o && uuid.test(o) ? o : undefined, c && uuid.test(c) ? c : undefined);
  }
}

@ApiTags('admin-deliveries')
@ApiBearerAuth()
@Roles('delivery_coordinator', 'delivery_staff', 'lab_manager') // super_admin always passes; couriers only see assigned deliveries
@Controller('admin/deliveries')
export class AdminDeliveriesController {
  constructor(private readonly svc: DeliveriesService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query('status') s?: string, @Query('search') q?: string, @Query('page') p?: string) { return this.svc.list(u, s, q, Math.max(1, Number(p) || 1)); }
  @Get('couriers') couriers() { return this.svc.couriers(); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Post(':id/status') status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliveryStatusDto) { return this.svc.setStatus(u, id, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliveryUpdateDto) { return this.svc.update(u, id, dto); }
}

@Module({ controllers: [DeliveriesController, AdminDeliveriesController], providers: [DeliveriesService] })
export class DeliveriesModule {}
