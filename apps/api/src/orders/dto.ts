import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateOrderDto {
  @IsIn(['cod', 'vodafone_cash', 'instapay', 'account']) payment_method: string;
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'phone must be 8-15 digits' }) phone: string;
  @IsString() @MinLength(5) @MaxLength(300) address: string;
  @IsOptional() @IsString() @MaxLength(300) delivery_instructions?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsUUID() idempotency_key: string;
  @IsOptional() @IsBoolean() save_address?: boolean;
}
export class SetOrderStatusDto {
  @IsIn(['confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled']) status: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class DueDto { @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2160) hours?: number | null; }
export class PaymentActionDto { @IsIn(['confirm', 'reject', 'unpaid']) action: string; }
export class ProofDto { @IsString() @MinLength(3) @MaxLength(60) reference: string; }
export class AddressDto {
  @IsString() @MinLength(5) @MaxLength(300) address_line: string;
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @Matches(/^\+?[0-9]{8,15}$/) phone?: string;
}
