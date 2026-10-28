import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { sniff } from '../products/products.service';
import { SettingsService } from '../settings/settings.service';
import { SupabaseService } from '../supabase/supabase.service';

const MSG: Record<string, string> = { payment_not_found: 'Payment not found', already_processed: 'This payment was already processed' };

class CreateDuesDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(10_000_000) amount: number;
  @IsIn(['vodafone_cash', 'instapay']) method: string;
  @IsString() @MinLength(3) @MaxLength(60) reference: string;
}
class RejectDto { @IsOptional() @IsString() @MaxLength(200) reason?: string; }

@Injectable()
export class DuesService {
  constructor(private readonly sb: SupabaseService, private readonly settings: SettingsService) {}

  private rpcError(m: string): never { const k = Object.keys(MSG).find((x) => m.includes(x)); throw new BadRequestException(k ? MSG[k] : m); }
  private audit(actor: string, action: string, id: string, details: object) {
    return this.sb.admin.from('audit_logs').insert({ actor_id: actor, action, entity: 'account_payments', entity_id: id, details });
  }

  // ---- doctor ----
  async options(userId: string) {
    const [s, bal] = await Promise.all([this.settings.getAll(), this.sb.admin.from('doctor_balances').select('balance').eq('doctor_id', userId).maybeSingle()]);
    const methods: { id: string; number?: string; handle?: string; name?: string }[] = [];
    if (s.payments.vodafone_cash.enabled) methods.push({ id: 'vodafone_cash', number: s.payments.vodafone_cash.number, name: s.payments.vodafone_cash.name });
    if (s.payments.instapay.enabled) methods.push({ id: 'instapay', handle: s.payments.instapay.handle, name: s.payments.instapay.name });
    return { methods, balance: Number(bal.data?.balance ?? 0) };
  }

  async mine(userId: string) {
    const { data, error } = await this.sb.admin.from('account_payments').select('id,amount,method,reference,status,reject_reason,created_at').eq('doctor_id', userId).order('created_at', { ascending: false }).limit(20);
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async create(userId: string, dto: CreateDuesDto, file?: Express.Multer.File) {
    const o = await this.options(userId);
    if (!o.methods.some((m) => m.id === dto.method)) throw new BadRequestException('This payment method is not available');
    if (!file) throw new BadRequestException('Receipt image is required');
    const type = sniff(file.buffer);
    if (!type) throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');
    const { count } = await this.sb.admin.from('account_payments').select('*', { count: 'exact', head: true }).eq('doctor_id', userId).eq('status', 'pending');
    if ((count ?? 0) >= 3) throw new BadRequestException('You already have 3 payments waiting for confirmation');

    const path = `${userId}/dues/${randomUUID()}.${type.ext}`;
    const up = await this.sb.admin.storage.from('payment-proofs').upload(path, file.buffer, { contentType: type.mime, upsert: false });
    if (up.error) throw new BadRequestException(up.error.message);
    const { error } = await this.sb.admin.from('account_payments').insert({ doctor_id: userId, amount: dto.amount, method: dto.method, reference: dto.reference.trim(), proof_path: path });
    if (error) { await this.sb.admin.storage.from('payment-proofs').remove([path]); throw new BadRequestException(error.message); }
    return this.mine(userId);
  }

  // ---- staff ----
  async list(status?: string) {
    let q = this.sb.admin.from('account_payments').select('id,doctor_id,amount,method,reference,proof_path,status,reject_reason,created_at,reviewed_at,profiles(full_name,email,phone)').order('created_at', { ascending: false }).limit(100);
    if (status === 'pending') q = q.eq('status', 'pending');
    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    return Promise.all((data ?? []).map(async (p: any) => {
      const { proof_path, ...rest } = p;
      const s = proof_path ? await this.sb.admin.storage.from('payment-proofs').createSignedUrl(proof_path, 600) : null;
      return { ...rest, proof_url: s?.data?.signedUrl ?? null };     // short-lived link, never a public URL
    }));
  }

  async confirm(actor: string, id: string) {
    const { error } = await this.sb.admin.rpc('confirm_dues', { p_id: id, p_admin: actor });
    if (error) this.rpcError(error.message);
    await this.audit(actor, 'dues.confirmed', id, {});
    return { ok: true };
  }

  async reject(actor: string, id: string, reason?: string) {
    const { error } = await this.sb.admin.rpc('reject_dues', { p_id: id, p_admin: actor, p_reason: reason?.trim() || null });
    if (error) this.rpcError(error.message);
    await this.audit(actor, 'dues.rejected', id, { reason });
    return { ok: true };
  }
}

@ApiTags('account')
@ApiBearerAuth()
@Roles('doctor')
@Controller('account')
export class DuesController {
  constructor(private readonly svc: DuesService) {}
  @Get('payment-options') options(@CurrentUser() u: AuthUser) { return this.svc.options(u.id); }
  @Get('payments') mine(@CurrentUser() u: AuthUser) { return this.svc.mine(u.id); }
  @Post('payments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateDuesDto, @UploadedFile() file?: Express.Multer.File) { return this.svc.create(u.id, dto, file); }
}

@ApiTags('admin-dues')
@ApiBearerAuth()
@Roles('accountant', 'lab_manager') // super_admin always passes
@Controller('admin/dues')
export class AdminDuesController {
  constructor(private readonly svc: DuesService) {}
  @Get() list(@Query('status') s?: string) { return this.svc.list(s); }
  @Post(':id/confirm') confirm(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.confirm(u.id, id); }
  @Post(':id/reject') reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto) { return this.svc.reject(u.id, id, dto.reason); }
}

@Module({ controllers: [DuesController, AdminDuesController], providers: [DuesService] })
export class DuesModule {}
