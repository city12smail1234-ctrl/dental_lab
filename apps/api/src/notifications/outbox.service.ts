import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Lang, renderMessage, sendTelegram, sendWhatsApp, telegramUpdates, tgConfig, waConfig } from './external';

type Row = { id: number; notification_id: string; user_id: string; channel: 'whatsapp' | 'telegram'; destination: string; attempts: number };
const MAX_ATTEMPTS = 5;

/** Sends queued WhatsApp/Telegram messages. Failed sends are retried with a growing delay, then marked failed (visible to the user). */
@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Outbox');
  private timer?: NodeJS.Timeout;
  private busy = false;
  private tgOffset = 0;

  constructor(private readonly sb: SupabaseService) {}

  onModuleInit() {
    if (process.env.DISABLE_OUTBOX === 'true') return;
    this.timer = setInterval(() => void this.tick(), 10_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try { await this.pollTelegramLinks(); await this.sendBatch(); }
    catch (e) { this.log.error((e as Error).message); }
    finally { this.busy = false; }
  }

  private baseUrl() { return (process.env.PUBLIC_WEB_URL || process.env.WEB_ORIGIN || '').split(',')[0].trim().replace(/\/$/, ''); }

  async sendBatch() {
    const { data, error } = await this.sb.admin.rpc('claim_outbox', { p_limit: 20 });
    if (error || !data?.length) { if (error) this.log.warn(error.message); return; }
    const rows = data as Row[];
    const [{ data: notes }, { data: prefs }] = await Promise.all([
      this.sb.admin.from('notifications').select('id,kind,params,link').in('id', rows.map((r) => r.notification_id)),
      this.sb.admin.from('notification_prefs').select('user_id,lang').in('user_id', [...new Set(rows.map((r) => r.user_id))]),
    ]);
    const wa = waConfig(); const tg = tgConfig();
    for (const r of rows) {
      const n = notes?.find((x) => x.id === r.notification_id);
      const lang = ((prefs?.find((p) => p.user_id === r.user_id)?.lang as Lang) ?? 'ar');
      try {
        if (!n) throw new Error('notification no longer exists');
        const text = renderMessage(n.kind, n.params, lang);
        const link = n.link ? `${this.baseUrl()}${n.link}` : '';
        if (r.channel === 'whatsapp') { if (!wa) return await this.fail(r, 'WhatsApp is not configured on the server', true); await sendWhatsApp(wa, r.destination, link ? `${text} ${link}` : text); }
        else { if (!tg) return await this.fail(r, 'Telegram is not configured on the server', true); await sendTelegram(tg, r.destination, link ? `${text}\n${link}` : text); }
        await this.sb.admin.from('notification_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', r.id);
      } catch (e) { await this.fail(r, (e as Error).message, false); }
    }
  }

  private async fail(r: Row, message: string, permanent: boolean) {
    const give = permanent || r.attempts >= MAX_ATTEMPTS;
    await this.sb.admin.from('notification_outbox').update({
      status: give ? 'failed' : 'pending', last_error: message.slice(0, 300),
      next_attempt_at: new Date(Date.now() + r.attempts * r.attempts * 60_000).toISOString(),    // 1, 4, 9, 16 minutes
    }).eq('id', r.id);
  }

  /** Connects Telegram accounts: the user opens the bot with a one-time code (/start CODE); we bind that chat to their account. */
  async pollTelegramLinks() {
    const tg = tgConfig();
    if (!tg) return;
    const { count } = await this.sb.admin.from('telegram_link_codes').select('*', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString());
    if (!count) return;
    const updates = await telegramUpdates(tg, this.tgOffset);
    for (const u of updates) {
      this.tgOffset = u.update_id + 1;
      const m = /^\/start\s+([A-Za-z0-9]{6,12})$/.exec(u.message?.text?.trim() ?? '');
      if (!m || !u.message) continue;
      const { data: code } = await this.sb.admin.from('telegram_link_codes').select('user_id').eq('code', m[1].toUpperCase()).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (!code) { await sendTelegram(tg, String(u.message.chat.id), '❌ الكود غير صحيح أو منتهي. / Invalid or expired code.').catch(() => {}); continue; }
      await this.sb.admin.from('notification_prefs').upsert({ user_id: code.user_id, telegram_chat_id: String(u.message.chat.id), telegram_enabled: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      await this.sb.admin.from('telegram_link_codes').delete().eq('user_id', code.user_id);
      await sendTelegram(tg, String(u.message.chat.id), '✅ تم ربط تيليجرام. هتوصلك التنبيهات هنا. / Telegram connected. Alerts will arrive here.').catch(() => {});
    }
  }
}
