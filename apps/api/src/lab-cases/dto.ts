import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsIn, Max, Min, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export const STATUSES = ['submitted', 'info_required', 'approved', 'designing', 'milling', 'finishing', 'quality_control', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'on_hold', 'rejected', 'cancelled'];

export class CreateCaseDto {
  @IsUUID() service_id: string;
  @IsString() @MinLength(1) @MaxLength(60) patient_ref: string;
  @IsOptional() @Matches(/^[0-9,\-\s]{1,100}$/, { message: 'tooth_numbers: digits, commas and dashes only' }) tooth_numbers?: string;
  @IsOptional() @IsString() @MaxLength(100) material?: string;
  @IsOptional() @IsString() @MaxLength(30) shade?: string;
  @IsOptional() @IsString() @MaxLength(2000) instructions?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) quantity?: number;
  @IsUUID() idempotency_key: string;
}
export class MessageDto { @IsString() @MinLength(1) @MaxLength(2000) body: string; }
export class NoteDto {
  @IsIn(['internal', 'doctor']) visibility: string;
  @IsString() @MinLength(1) @MaxLength(2000) body: string;
}
export class CaseStatusDto {
  @IsIn(STATUSES.filter((s) => s !== 'submitted')) status: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class CaseUpdateDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2160) due_in_hours?: number | null;
  @IsOptional() @IsUUID() assigned_to?: string | null;
  @IsOptional() @IsDateString() estimated_completion?: string | null;
}
