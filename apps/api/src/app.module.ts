import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthGuard } from './auth/auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AuthController } from './auth/auth.controller';
import { DoctorsModule } from './doctors/doctors.module';
import { LabServicesModule } from './lab-services/lab-services.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { SettingsModule } from './settings/settings.module';
import { LabCasesModule } from './lab-cases/lab-cases.module';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';
import { AccountsModule } from './accounts/accounts.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { AdminToolsModule } from './admin-tools/admin-tools.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, envFilePath: ['.env', '../../.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    SupabaseModule,
    DoctorsModule,
    LabServicesModule,
    ProductsModule,
    CartModule,
    SettingsModule,
    OrdersModule,
    LabCasesModule,
    AccountsModule,
    NotificationsModule,
    DeliveriesModule,
    AdminToolsModule,
    DiagnosticsModule,
  ],
  controllers: [AuthController, HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },   // every route requires auth unless @Public()
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
