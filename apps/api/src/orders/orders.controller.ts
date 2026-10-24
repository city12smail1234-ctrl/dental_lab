import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { AddressDto, CreateOrderDto, DueDto, PaymentActionDto, ProofDto, SetOrderStatusDto } from './dto';
import { OrdersService } from './orders.service';

@ApiTags('checkout')
@ApiBearerAuth()
@Roles('doctor')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly svc: OrdersService) {}
  @Get() get(@CurrentUser() u: AuthUser) { return this.svc.checkout(u.id); }
}

@ApiTags('orders')
@ApiBearerAuth()
@Roles('doctor')
@Controller('orders')
export class OrdersController {
  constructor(private readonly svc: OrdersService) {}
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateOrderDto) { return this.svc.createOrder(u.id, dto); }
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.myOrders(u.id); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.myOrder(u.id, id); }
  @Post(':id/cancel') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancelMine(u.id, id); }

  @Post(':id/payment-proof')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  proof(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProofDto, @UploadedFile() file?: Express.Multer.File) {
    return this.svc.submitProof(u.id, id, dto.reference, file);
  }
}

@ApiTags('addresses')
@ApiBearerAuth()
@Roles('doctor')
@Controller('addresses')
export class AddressesController {
  constructor(private readonly svc: OrdersService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.addresses(u.id); }
  @Post() add(@CurrentUser() u: AuthUser, @Body() dto: AddressDto) { return this.svc.addAddress(u.id, dto); }
  @Delete(':id') del(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteAddress(u.id, id); }
}

@ApiTags('admin-orders')
@ApiBearerAuth()
@Roles('order_manager', 'accountant', 'lab_manager') // super_admin always passes
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly svc: OrdersService) {}
  @Get() list(@Query('status') status?: string, @Query('search') search?: string, @Query('page') p?: string) {
    return this.svc.adminList(status, search, Math.max(1, Number(p) || 1));
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.adminGet(id); }

  @Roles('order_manager', 'lab_manager')
  @Post(':id/status') status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetOrderStatusDto) {
    return this.svc.adminSetStatus(u.id, id, dto.status, dto.note);
  }
  @Roles('order_manager', 'lab_manager')
  @Post(':id/due') due(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DueDto) { return this.svc.adminSetDue(u.id, id, dto.hours ?? null); }
  @Post(':id/payment') payment(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentActionDto) {
    return this.svc.adminPayment(u.id, id, dto.action);
  }
}
