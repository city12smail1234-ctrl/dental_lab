import { Controller, Get, Injectable } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators';
import { SupabaseService } from '../supabase/supabase.service';

const TABLES = ['account_payments', 'notification_outbox', 'notification_prefs', 'deliveries', 'notifications', 'lab_case_files', 'doctor_account_entries', 'lab_services', 'products', 'cart_items', 'orders', 'app_settings', 'lab_cases'];
const Z = '00000000-0000-0000-0000-000000000000';
const FUNCTIONS: [string, object][] = [
  ['confirm_dues', { p_id: Z, p_admin: null }],
  ['claim_outbox', { p_limit: 0 }],
  ['delivery_move', { p_id: Z, p_status: 'x', p_note: null, p_user: null, p_force: false, p_received_by: null }],
  ['report_summary', { p_from: '2026-01-01', p_to: '2026-01-01' }],
  ['report_rows', { p_from: '2026-01-01', p_to: '2026-01-01' }],
  ['doctor_params', { p_id: Z }],
  ['adjust_stock', { p_product: Z, p_delta: 1, p_reason: 'x', p_note: null, p_user: null }],
  ['create_order', { p_user: Z, p_key: 'x', p_method: 'cod', p_phone: 'x', p_address: 'x', p_instr: null, p_notes: null, p_flat_fee: 0, p_free_over: null }],
  ['set_order_status', { p_order: Z, p_status: 'x', p_note: null, p_user: null }],
  ['create_case', { p_user: Z, p_key: 'x', p_service: Z, p_patient: 'x', p_teeth: null, p_material: null, p_shade: null, p_instr: null, p_qty: 1 }],
  ['set_case_status', { p_case: Z, p_status: 'x', p_note: null, p_user: null, p_staff: true }],
];

@Injectable()
export class DiagnosticsService {
  constructor(private readonly sb: SupabaseService) {}
  private async count(table: string, f?: (q: any) => any) {
    let q: any = this.sb.admin.from(table).select('*', { count: 'exact', head: true });
    if (f) q = f(q);
    const r = await q;
    return r.error ? 0 : r.count ?? 0;
  }

  async run() {
    const missing: string[] = [];
    for (const t of TABLES) { const r = await this.sb.admin.from(t).select('*', { count: 'exact', head: true }); if (r.error) missing.push(`table:${t}`); }
    for (const [fn, args] of FUNCTIONS) { const r = await this.sb.admin.rpc(fn, args); if (r.error?.code === 'PGRST202') missing.push(`function:${fn}`); }

    const { data: prods } = await this.sb.admin.from('products').select('stock_quantity,low_stock_threshold').eq('is_active', true).limit(2000);
    return {
      missing,
      counts: {
        orders_pending: await this.count('orders', (q) => q.eq('status', 'pending')),
        cases_open: await this.count('lab_cases', (q) => q.not('status', 'in', '(delivered,rejected,cancelled)')),
        deliveries_new: await this.count('deliveries', (q) => q.eq('status', 'awaiting_confirmation')),
        dues_pending: await this.count('account_payments', (q) => q.eq('status', 'pending')),
        cases_new: await this.count('lab_cases', (q) => q.eq('status', 'submitted')),
        products_active: (prods ?? []).length,
        products_low: (prods ?? []).filter((p) => p.stock_quantity <= p.low_stock_threshold).length,
        services_active: await this.count('lab_services', (q) => q.eq('is_active', true)),
      },
    };
  }
}

@ApiTags('admin-diagnostics')
@ApiBearerAuth()
@Roles('lab_manager')
@Controller('admin/diagnostics')
export class DiagnosticsController {
  constructor(private readonly svc: DiagnosticsService) {}
  @Get() run() { return this.svc.run(); }
}
