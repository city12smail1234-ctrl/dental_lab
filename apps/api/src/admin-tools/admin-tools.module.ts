import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { SupabaseService } from '../supabase/supabase.service';

// super_admin is deliberately NOT grantable here: the owner account is provisioned only through the secure SQL setup.
const STAFF_ROLES = ['lab_manager', 'technician', 'order_manager', 'delivery_coordinator', 'delivery_staff', 'accountant', 'inventory_manager'];
class AddStaffDto { @IsEmail() email: string; @IsIn(STAFF_ROLES) role: string; }

@Injectable()
export class AdminToolsService {
  constructor(private readonly sb: SupabaseService) {}
  private audit(actor: string, action: string, id: string, details: object) {
    return this.sb.admin.from('audit_logs').insert({ actor_id: actor, action, entity: 'staff', entity_id: id, details });
  }

  // ---- staff ----
  async staff() {
    const { data: rows } = await this.sb.admin.from('user_roles').select('user_id,role').neq('role', 'doctor');
    const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
    if (!ids.length) return [];
    const { data: profs } = await this.sb.admin.from('profiles').select('id,full_name,email,phone').in('id', ids);
    return (profs ?? []).map((p) => ({ ...p, roles: (rows ?? []).filter((r) => r.user_id === p.id).map((r) => r.role) }));
  }

  async addStaff(actor: string, dto: AddStaffDto) {
    const { data: p } = await this.sb.admin.from('profiles').select('id').eq('email', dto.email.trim().toLowerCase()).maybeSingle();
    if (!p) throw new NotFoundException('No account with this email. Ask them to register first, then add the role here.');
    const { error } = await this.sb.admin.from('user_roles').upsert({ user_id: p.id, role: dto.role }, { onConflict: 'user_id,role' });
    if (error) throw new BadRequestException(error.message);
    await this.sb.admin.from('staff_profiles').upsert({ user_id: p.id }, { onConflict: 'user_id' });
    await this.audit(actor, 'staff.role_added', p.id, { role: dto.role });
    return this.staff();
  }

  async removeStaff(actor: string, userId: string, role: string) {
    if (!STAFF_ROLES.includes(role)) throw new BadRequestException('This role cannot be changed here');
    await this.sb.admin.from('user_roles').delete().eq('user_id', userId).eq('role', role);
    await this.audit(actor, 'staff.role_removed', userId, { role });
    return this.staff();
  }

  // ---- audit log ----
  async auditLog(page: number, entity?: string, action?: string) {
    const limit = 30;
    let q = this.sb.admin.from('audit_logs').select('id,actor_id,action,entity,entity_id,details,created_at', { count: 'exact' }).order('id', { ascending: false }).range((page - 1) * limit, page * limit - 1);
    if (entity) q = q.eq('entity', entity.replace(/[^a-z_]/g, ''));
    const a = (action ?? '').replace(/[^a-z_.]/g, '');
    if (a) q = q.ilike('action', `${a}%`);
    const { data, count, error } = await q;
    if (error) throw new BadRequestException(error.message);
    const actors = [...new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
    const { data: profs } = actors.length ? await this.sb.admin.from('profiles').select('id,full_name,email').in('id', actors) : { data: [] };
    const map = new Map((profs ?? []).map((p) => [p.id, p.full_name ?? p.email]));
    const targets = await this.targetLabels(data ?? []);
    return { items: (data ?? []).map((r) => ({ ...r, actor: r.actor_id ? map.get(r.actor_id) ?? null : null, target: targets.get(`${r.entity}:${r.entity_id}`) ?? null })), total: count ?? 0, page, limit };
  }

  /** Turns entity ids into readable labels (doctor name, order/case number...) so the log is not just codes. */
  private async targetLabels(rows: { entity: string; entity_id: string | null }[]) {
    const out = new Map<string, string>();
    const ids = (e: string[]) => [...new Set(rows.filter((r) => e.includes(r.entity) && r.entity_id).map((r) => r.entity_id as string))];
    const people = ids(['doctor_profiles', 'doctor_account', 'staff']);
    const orders = ids(['orders']), cases = ids(['lab_cases']), deliveries = ids(['deliveries']), products = ids(['products']), services = ids(['lab_services']);
    const [pp, oo, cc, dd, pr, sv] = await Promise.all([
      people.length ? this.sb.admin.from('profiles').select('id,full_name,email').in('id', people) : { data: [] },
      orders.length ? this.sb.admin.from('orders').select('id,order_number,doctor_id').in('id', orders) : { data: [] },
      cases.length ? this.sb.admin.from('lab_cases').select('id,case_number,doctor_id').in('id', cases) : { data: [] },
      deliveries.length ? this.sb.admin.from('deliveries').select('id,reference,doctor_id').in('id', deliveries) : { data: [] },
      products.length ? this.sb.admin.from('products').select('id,sku,name_en').in('id', products) : { data: [] },
      services.length ? this.sb.admin.from('lab_services').select('id,name_en').in('id', services) : { data: [] },
    ]);
    const docIds = [...new Set([...(oo.data ?? []), ...(cc.data ?? []), ...(dd.data ?? [])].map((x: any) => x.doctor_id))];
    const { data: docs } = docIds.length ? await this.sb.admin.from('profiles').select('id,full_name,email').in('id', docIds) : { data: [] };
    const nameOf = new Map([...(pp.data ?? []), ...(docs ?? [])].map((p: any) => [p.id, p.full_name ?? p.email]));
    for (const p of pp.data ?? []) for (const e of ['doctor_profiles', 'doctor_account', 'staff']) out.set(`${e}:${p.id}`, nameOf.get(p.id) ?? '');
    for (const o of oo.data ?? []) out.set(`orders:${o.id}`, `${o.order_number} — ${nameOf.get(o.doctor_id) ?? ''}`);
    for (const c of cc.data ?? []) out.set(`lab_cases:${c.id}`, `${c.case_number} — ${nameOf.get(c.doctor_id) ?? ''}`);
    for (const d of dd.data ?? []) out.set(`deliveries:${d.id}`, `${d.reference} — ${nameOf.get(d.doctor_id) ?? ''}`);
    for (const p of pr.data ?? []) out.set(`products:${p.id}`, `${p.sku} — ${p.name_en}`);
    for (const s of sv.data ?? []) out.set(`lab_services:${s.id}`, s.name_en);
    return out;
  }

  // ---- reports ----
  private range(from?: string, to?: string) {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date();
    const end = to && iso.test(to) ? to : today.toISOString().slice(0, 10);
    const start = from && iso.test(from) ? from : new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const days = (Date.parse(end) - Date.parse(start)) / 86400000;
    if (!(days >= 0) || days > 365) throw new BadRequestException('Choose a range of up to 365 days');
    return { start, end };
  }

  async reportRows(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    const { data, error } = await this.sb.admin.rpc('report_rows', { p_from: start, p_to: end });
    if (error) throw new BadRequestException(error.message);
    return { from: start, to: end, rows: data as object[] };
  }

  async report(from?: string, to?: string) {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date();
    const end = to && iso.test(to) ? to : today.toISOString().slice(0, 10);
    const start = from && iso.test(from) ? from : new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const days = (Date.parse(end) - Date.parse(start)) / 86400000;
    if (!(days >= 0) || days > 365) throw new BadRequestException('Choose a range of up to 365 days');
    const { data, error } = await this.sb.admin.rpc('report_summary', { p_from: start, p_to: end });
    if (error) throw new BadRequestException(error.message);
    return { from: start, to: end, ...(data as object) };
  }
}

@ApiTags('admin-staff')
@ApiBearerAuth()
@Roles('super_admin') // only the owner manages staff
@Controller('admin/staff')
export class StaffController {
  constructor(private readonly svc: AdminToolsService) {}
  @Get() list() { return this.svc.staff(); }
  @Post() add(@CurrentUser() u: AuthUser, @Body() dto: AddStaffDto) { return this.svc.addStaff(u.id, dto); }
  @Delete(':userId/:role') remove(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) id: string, @Param('role') role: string) { return this.svc.removeStaff(u.id, id, role); }
}

@ApiTags('admin-audit')
@ApiBearerAuth()
@Roles('lab_manager')
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly svc: AdminToolsService) {}
  @Get() list(@Query('page') p?: string, @Query('entity') e?: string, @Query('action') a?: string) { return this.svc.auditLog(Math.max(1, Number(p) || 1), e, a); }
}

@ApiTags('admin-reports')
@ApiBearerAuth()
@Roles('accountant', 'lab_manager')
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly svc: AdminToolsService) {}
  @Get() report(@Query('from') f?: string, @Query('to') t?: string) { return this.svc.report(f, t); }
  /** Detailed rows with doctor and clinic names (for the CSV export). */
  @Get('export') rows(@Query('from') f?: string, @Query('to') t?: string) { return this.svc.reportRows(f, t); }
}

@Module({ controllers: [StaffController, AuditController, ReportsController], providers: [AdminToolsService] })
export class AdminToolsModule {}
