import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { AuthUser, CurrentUser } from '../auth/decorators';
import { SupabaseService } from '../supabase/supabase.service';
import { tgConfig, waConfig } from './external';
import { OutboxService } from './outbox.service';

const TOPICS = ['cases', 'orders', 'doctors', 'deliveries'];

class MarkReadDto {
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) ids?: string[];
  @IsOptional() @IsBoolean() all?: boolean;
}
class PrefsDto {
  @IsOptional() @IsIn(['ar', 'en']) lang?: string;
  @IsOptional() @Matches(/^\+?[0-9]{8,15}$/, { message: 'WhatsApp number: 8-15 digits, with the country code' }) whatsapp_number?: string | null;
  @IsOptional() @IsBoolean() whatsapp_enabled?: boolean;
  @IsOptional() @IsBoolean() telegram_enabled?: boolean;
  @IsOptional() @IsArray() @IsIn(TOPICS, { each: true }) @IsString({ each: true }) topics?: string[] | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly sb: SupabaseService) {}

  async list(userId: string, unreadOnly: boolean, limit: number) {
    let q = this.sb.admin.from('notifications').select('id,kind,params,link,read_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
    if (unreadOnly) q = q.is('read_at', null);
    const [list, unread] = await Promise.all([
      q,
      this.sb.admin.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null),
    ]);
    return { items: list.data ?? [], unread: unread.count ?? 0 };
  }

  async markRead(userId: string, dto: MarkReadDto) {
    let q = this.sb.admin.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
    if (!dto.all) q = q.in('id', dto.ids?.length ? dto.ids : ['00000000-0000-0000-0000-000000000000']);
    await q;   // always scoped to the caller: nobody can touch another user's notifications
    return this.list(userId, false, 30);
  }

  // ---- alerts outside the website ----
  private isStaff(u: AuthUser) { return u.roles.some((r) => r !== 'doctor'); }

  async prefs(u: AuthUser) {
    const [p, out] = await Promise.all([
      this.sb.admin.from('notification_prefs').select('lang,whatsapp_number,whatsapp_enabled,telegram_chat_id,telegram_enabled,topics').eq('user_id', u.id).maybeSingle(),
      this.sb.admin.from('notification_outbox').select('id,channel,status,attempts,last_error,created_at,sent_at').eq('user_id', u.id).order('id', { ascending: false }).limit(5),
    ]);
    const d = p.data;
    return {
      prefs: { lang: d?.lang ?? 'ar', whatsapp_number: d?.whatsapp_number ?? '', whatsapp_enabled: d?.whatsapp_enabled ?? false, telegram_connected: !!d?.telegram_chat_id, telegram_enabled: d?.telegram_enabled ?? false, topics: d?.topics ?? null },
      server: { whatsapp: !!waConfig(), telegram: !!tgConfig(), telegram_bot: process.env.TELEGRAM_BOT_USERNAME ?? null },
      can_whatsapp: this.isStaff(u),
      recent: out.data ?? [],
    };
  }

  async savePrefs(u: AuthUser, dto: PrefsDto) {
    if (dto.whatsapp_number && !this.isStaff(u)) throw new ForbiddenException('WhatsApp alerts are available for lab staff only');
    const { data: cur } = await this.sb.admin.from('notification_prefs').select('whatsapp_number,telegram_chat_id').eq('user_id', u.id).maybeSingle();
    const number = dto.whatsapp_number === undefined ? cur?.whatsapp_number : dto.whatsapp_number || null;
    if (dto.whatsapp_enabled && !number) throw new BadRequestException('Enter your WhatsApp number first');
    if (dto.telegram_enabled && !cur?.telegram_chat_id) throw new BadRequestException('Connect Telegram first');
    const row: Record<string, unknown> = { user_id: u.id, updated_at: new Date().toISOString() };
    if (dto.lang) row.lang = dto.lang;
    if (dto.whatsapp_number !== undefined) row.whatsapp_number = number;
    if (dto.whatsapp_enabled !== undefined) row.whatsapp_enabled = dto.whatsapp_enabled;
    if (dto.telegram_enabled !== undefined) row.telegram_enabled = dto.telegram_enabled;
    if (dto.topics !== undefined) row.topics = dto.topics && dto.topics.length ? dto.topics : null;
    const { error } = await this.sb.admin.from('notification_prefs').upsert(row, { onConflict: 'user_id' });
    if (error) throw new BadRequestException(error.message);
    return this.prefs(u);
  }

  async telegramLink(u: AuthUser) {
    if (!tgConfig() || !process.env.TELEGRAM_BOT_USERNAME) throw new BadRequestException('Telegram is not set up on the server yet');
    const code = randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, 'A').slice(0, 8).toUpperCase();
    await this.sb.admin.from('telegram_link_codes').delete().eq('user_id', u.id);
    const { error } = await this.sb.admin.from('telegram_link_codes').insert({ code, user_id: u.id, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
    if (error) throw new BadRequestException(error.message);
    return { code, url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${code}` };
  }

  async telegramUnlink(u: AuthUser) {
    await this.sb.admin.from('notification_prefs').update({ telegram_chat_id: null, telegram_enabled: false }).eq('user_id', u.id);
    return this.prefs(u);
  }

  async sendTest(u: AuthUser) {
    const { data: n } = await this.sb.admin.from('notifications').insert({ user_id: u.id, kind: 'test', params: {}, link: null }).select('id').single();
    const { count } = await this.sb.admin.from('notification_outbox').select('*', { count: 'exact', head: true }).eq('notification_id', n?.id ?? '');
    return { queued: count ?? 0 };    // 0 = no external channel is enabled for this user
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}
  /** Any signed-in user: their own notifications only. */
  @Get() list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    return this.svc.list(u.id, unread === '1', Math.min(100, Math.max(1, Number(limit) || 30)));
  }
  @Post('read') read(@CurrentUser() u: AuthUser, @Body() dto: MarkReadDto) { return this.svc.markRead(u.id, dto); }

  @Get('prefs') prefs(@CurrentUser() u: AuthUser) { return this.svc.prefs(u); }
  @Put('prefs') save(@CurrentUser() u: AuthUser, @Body() dto: PrefsDto) { return this.svc.savePrefs(u, dto); }
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('telegram/link') link(@CurrentUser() u: AuthUser) { return this.svc.telegramLink(u); }
  @Post('telegram/unlink') unlink(@CurrentUser() u: AuthUser) { return this.svc.telegramUnlink(u); }
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) @Post('test') test(@CurrentUser() u: AuthUser) { return this.svc.sendTest(u); }
}

@Module({ controllers: [NotificationsController], providers: [NotificationsService, OutboxService] })
export class NotificationsModule {}
