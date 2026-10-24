import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { AddressesController, AdminOrdersController, CheckoutController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({ imports: [CartModule], controllers: [CheckoutController, OrdersController, AddressesController, AdminOrdersController], providers: [OrdersService] })
export class OrdersModule {}
