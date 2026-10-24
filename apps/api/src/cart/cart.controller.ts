import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { CartService } from './cart.service';

class SetQuantityDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) quantity: number;
}

@ApiTags('cart')
@ApiBearerAuth()
@Roles('doctor')
@Controller('cart')
export class CartController {
  constructor(private readonly svc: CartService) {}

  @Get() get(@CurrentUser() u: AuthUser) { return this.svc.get(u.id); }
  @Put('items/:productId')
  set(@CurrentUser() u: AuthUser, @Param('productId', ParseUUIDPipe) id: string, @Body() dto: SetQuantityDto) { return this.svc.setItem(u.id, id, dto.quantity); }
  @Delete('items/:productId') remove(@CurrentUser() u: AuthUser, @Param('productId', ParseUUIDPipe) id: string) { return this.svc.remove(u.id, id); }
  @Delete() clear(@CurrentUser() u: AuthUser) { return this.svc.clear(u.id); }
}
