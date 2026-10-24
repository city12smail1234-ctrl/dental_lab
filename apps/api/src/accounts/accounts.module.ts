import { Module } from '@nestjs/common';
import { AccountController, AdminAccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({ controllers: [AccountController, AdminAccountsController], providers: [AccountsService] })
export class AccountsModule {}
