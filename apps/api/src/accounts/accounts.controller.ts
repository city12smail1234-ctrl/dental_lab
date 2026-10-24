import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { AccountsService, AdjustmentDto, RecordPaymentDto } from './accounts.service';

@ApiTags('account')
@ApiBearerAuth()
@Roles('doctor')
@Controller('account')
export class AccountController {
  constructor(private readonly svc: AccountsService) {}
  /** A doctor only ever sees their own statement. */
  @Get() mine(@CurrentUser() u: AuthUser) { return this.svc.mine(u.id); }
}

@ApiTags('admin-accounts')
@ApiBearerAuth()
@Roles('accountant', 'lab_manager') // super_admin always passes
@Controller('admin/accounts')
export class AdminAccountsController {
  constructor(private readonly svc: AccountsService) {}
  @Get() list() { return this.svc.list(); }
  @Get(':id') one(@Param('id', ParseUUIDPipe) id: string) { return this.svc.one(id); }
  @Post(':id/payments') pay(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordPaymentDto) { return this.svc.recordPayment(u.id, id, dto); }
  @Post(':id/adjustments') adjust(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustmentDto) { return this.svc.adjust(u.id, id, dto); }
}
