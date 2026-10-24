import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { AdjustStockDto, CreateProductCategoryDto, CreateProductDto, UpdateProductCategoryDto, UpdateProductDto } from './dto';
import { ProductsService } from './products.service';

const page = (p?: string) => Math.max(1, Number(p) || 1);

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  /** Any signed-in user: active products only. */
  @Get() list(@Query('search') search?: string, @Query('category') category?: string, @Query('sort') sort?: string, @Query('page') p?: string) {
    return this.svc.list({ search, category, sort, page: page(p), admin: false });
  }
  @Get('categories') categories() { return this.svc.categories(true); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id, false); }
}

@ApiTags('admin-products')
@ApiBearerAuth()
@Roles('inventory_manager', 'lab_manager') // super_admin always passes
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get() list(@Query('search') search?: string, @Query('page') p?: string) { return this.svc.list({ search, page: page(p), admin: true }); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateProductDto) { return this.svc.create(u.id, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) { return this.svc.update(u.id, id, dto); }

  @Post(':id/stock')
  stock(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustStockDto) { return this.svc.adjustStock(u.id, id, dto); }

  @Post(':id/images')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024, files: 1 } }))
  addImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) { return this.svc.addImage(id, file); }

  @Delete('images/:imageId')
  removeImage(@Param('imageId', ParseUUIDPipe) imageId: string) { return this.svc.removeImage(imageId); }
}

@ApiTags('admin-product-categories')
@ApiBearerAuth()
@Roles('inventory_manager', 'lab_manager')
@Controller('admin/product-categories')
export class AdminProductCategoriesController {
  constructor(private readonly svc: ProductsService) {}

  @Get() list() { return this.svc.categories(false); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateProductCategoryDto) { return this.svc.createCategory(u.id, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductCategoryDto) { return this.svc.updateCategory(u.id, id, dto); }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteCategory(u.id, id); }
}
