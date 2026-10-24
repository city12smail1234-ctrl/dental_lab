import { Module } from '@nestjs/common';
import { AdminProductCategoriesController, AdminProductsController, ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({ controllers: [ProductsController, AdminProductsController, AdminProductCategoriesController], providers: [ProductsService] })
export class ProductsModule {}
