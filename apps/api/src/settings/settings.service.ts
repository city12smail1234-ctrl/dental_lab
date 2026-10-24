import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SupabaseService } from '../supabase/supabase.service';

export const settingsSchema = z.object({
  business: z.object({ name: z.string().min(1).max(100), phone: z.string().max(30), address: z.string().max(300) }),
  delivery: z.object({ flat_fee: z.number().min(0).max(100000), free_over: z.number().min(0).nullable() }),
  payments: z.object({
    cod: z.object({ enabled: z.boolean() }),
    account: z.object({ enabled: z.boolean() }).default({ enabled: false }),
    vodafone_cash: z.object({ enabled: z.boolean(), number: z.string().max(30), name: z.string().max(100) }),
    instapay: z.object({ enabled: z.boolean(), handle: z.string().max(100), name: z.string().max(100) }),
  }),
}).superRefine((v, ctx) => {
  if (v.payments.vodafone_cash.enabled && !v.payments.vodafone_cash.number.trim())
    ctx.addIssue({ code: 'custom', message: 'Vodafone Cash number is required when enabled' });
  if (v.payments.instapay.enabled && !v.payments.instapay.handle.trim())
    ctx.addIssue({ code: 'custom', message: 'InstaPay address is required when enabled' });
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULTS = {
  business: { name: 'City Smile Dental Lab', phone: '', address: '' },
  delivery: { flat_fee: 0, free_over: null as number | null },
  payments: {
    cod: { enabled: true }, account: { enabled: false },
    vodafone_cash: { enabled: false, number: '', name: '' }, instapay: { enabled: false, handle: '', name: '' },
  },
};

/** Fills anything missing (a deleted row, or a key added in a newer version) from the defaults, so no screen ever sees `undefined`. */
function withDefaults(rows: Record<string, any>): Settings {
  const p = rows.payments ?? {};
  return {
    business: { ...DEFAULTS.business, ...rows.business },
    delivery: { ...DEFAULTS.delivery, ...rows.delivery },
    payments: {
      cod: { ...DEFAULTS.payments.cod, ...p.cod }, account: { ...DEFAULTS.payments.account, ...p.account },
      vodafone_cash: { ...DEFAULTS.payments.vodafone_cash, ...p.vodafone_cash }, instapay: { ...DEFAULTS.payments.instapay, ...p.instapay },
    },
  };
}

@Injectable()
export class SettingsService {
  constructor(private readonly sb: SupabaseService) {}

  async getAll(): Promise<Settings> {
    const { data, error } = await this.sb.admin.from('app_settings').select('key,value');
    if (error) throw new BadRequestException(error.message);
    return withDefaults(Object.fromEntries((data ?? []).map((r) => [r.key, r.value])));
  }

  async put(userId: string, body: unknown) {
    const r = settingsSchema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const rows = Object.entries(r.data).map(([key, value]) => ({ key, value, updated_by: userId, updated_at: new Date().toISOString() }));
    const { error } = await this.sb.admin.from('app_settings').upsert(rows);
    if (error) throw new BadRequestException(error.message);
    await this.sb.admin.from('audit_logs').insert({ actor_id: userId, action: 'settings.updated', entity: 'app_settings', entity_id: 'all', details: {} });
    return r.data;
  }
}
