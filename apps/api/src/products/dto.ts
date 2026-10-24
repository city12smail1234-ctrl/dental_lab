import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateProductCategoryDto {
  @IsString() @MaxLength(100) name_ar: string;
  @IsString() @MaxLength(100) name_en: string;
  @IsOptional() @IsUUID() parent_id?: string | null;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
export class UpdateProductCategoryDto extends PartialType(CreateProductCategoryDto) {}

export class CreateProductDto {
  @Matches(/^[A-Za-z0-9._-]{2,40}$/, { message: 'sku: 2-40 letters, digits, . _ -' }) sku: string;
  @IsUUID() category_id: string;
  @IsString() @MaxLength(150) name_ar: string;
  @IsString() @MaxLength(150) name_en: string;
  @IsOptional() @IsString() @MaxLength(2000) description_ar?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) description_en?: string | null;
  @IsOptional() @IsString() @MaxLength(100) brand?: string | null;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) price: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discount_price?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) min_order_qty?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) low_stock_threshold?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsBoolean() is_featured?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) initial_stock?: number;
}
export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['initial_stock'] as const)) {}

export class AdjustStockDto {
  @Type(() => Number) @IsInt() @Min(-1_000_000) @Max(1_000_000) delta: number;
  @IsIn(['purchase', 'adjustment', 'return', 'damage']) reason: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
