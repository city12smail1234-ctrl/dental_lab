import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateCategoryDto {
  @IsString() @MaxLength(100) name_ar: string;
  @IsString() @MaxLength(100) name_en: string;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CreateServiceDto {
  @IsUUID() category_id: string;
  @IsString() @MaxLength(150) name_ar: string;
  @IsString() @MaxLength(150) name_en: string;
  @IsOptional() @IsString() @MaxLength(1000) description_ar?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) description_en?: string | null;
  @IsOptional() @IsString() @MaxLength(150) material?: string | null;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) price: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) turnaround_days?: number | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
export class UpdateServiceDto extends PartialType(CreateServiceDto) {}
