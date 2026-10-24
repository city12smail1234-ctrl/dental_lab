import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { SupabaseService } from '../supabase/supabase.service';

export class RecordPaymentDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @IsIn(['cash', 'vodafone_cash', 'instapay', 'bank', 'other']) method: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class AdjustmentDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) amount: number;          // + adds to what the doctor owes, - reduces it
  @IsString() @MinLength(3) @MaxLength(300) note: string;
}

@Injectable()
export class AccountsService {
  constructor(private readonly sb: SupabaseService) {}

  private async statement(doctorId: string) {
    const [bal, ent] = await Promise.all([
      this.sb.admin.from('doctor_balances').select('*').eq('doctor_id', doctorId).maybeSingle(),
      this.sb.admin.from('doctor_account_entries').select('id,kind,amount,source_type,source_id,reference,method,note,created_at').eq('doctor_id', doctorId).order('id', { ascending: false }).limit(300),
    ]);
    if (ent.error) throw new BadRequestException(ent.error.message);
    return {
      summary: { balance: Number(bal.data?.balance ?? 0), charged: Number(bal.data?.charged ?? 0), credited: Number(bal.data?.credited ?? 0) },
      entries: ent.data ?? [],
      doctor: bal.data ? { id: bal.data.doctor_id, full_name: bal.data.full_name, email: bal.data.email, clinic_name: bal.data.clinic_name } : null,
    };
  }

  mine(userId: string) { return this.statement(userId); }

  async list() {
    const { data, error } = await this.sb.admin.from('doctor_balances').select('*').order('balance', { ascending: false }).limit(500);
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async one(doctorId: string) {
    const s = await this.statement(doctorId);
    if (!s.doctor) throw new NotFoundException();
    return s;
  }

  private audit(actor: string, action: string, id: string, details: object) {
    return this.sb.admin.from('audit_logs').insert({ actor_id: actor, action, entity: 'doctor_account', entity_id: id, details });
  }

  async recordPayment(actor: string, doctorId: string, dto: RecordPaymentDto) {
    await this.one(doctorId);
    const { error } = await this.sb.admin.from('doctor_account_entries').insert({
      doctor_id: doctorId, kind: 'payment', amount: -dto.amount, source_type: 'manual', method: dto.method, note: dto.note ?? null, created_by: actor,
    });
    if (error) throw new BadRequestException(error.message);
    await this.audit(actor, 'account.payment_recorded', doctorId, { amount: dto.amount, method: dto.method });
    return this.one(doctorId);
  }

  async adjust(actor: string, doctorId: string, dto: AdjustmentDto) {
    if (dto.amount === 0) throw new BadRequestException('Amount cannot be zero');
    await this.one(doctorId);
    const { error } = await this.sb.admin.from('doctor_account_entries').insert({
      doctor_id: doctorId, kind: 'adjustment', amount: dto.amount, source_type: 'manual', note: dto.note, created_by: actor,
    });
    if (error) throw new BadRequestException(error.message);
    await this.audit(actor, 'account.adjusted', doctorId, { amount: dto.amount, note: dto.note });
    return this.one(doctorId);
  }
}
