import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/decorators';
import { CreateCategoryDto, CreateServiceDto, UpdateCategoryDto, UpdateServiceDto } from './dto';
import { LabServicesService } from './lab-services.service';

@ApiTags('lab-services')
@ApiBearerAuth()
@Controller('lab-services')
export class LabServicesController {
  constructor(private readonly svc: LabServicesService) {}

  /** Any signed-in user: active categories and services only. */
  @Get()
  list() { return this.svc.list(true); }
}

/** The landing page shows the price list to everyone, so this one endpoint needs no login. Only public-safe fields are returned. */
@ApiTags('public')
@Controller('public')
export class PublicPriceListController {
  constructor(private readonly svc: LabServicesService) {}

  @Public()
  @Get('price-list')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=60')
  async priceList() {
    const { categories, services } = await this.svc.list(true);
    return {
      categories: categories.map((c: any) => ({ id: c.id, name_ar: c.name_ar, name_en: c.name_en })),
      services: services.map((s: any) => ({
        id: s.id, category_id: s.category_id, name_ar: s.name_ar, name_en: s.name_en, description_ar: s.description_ar, description_en: s.description_en,
        material: s.material, price: s.price, turnaround_days: s.turnaround_days, image_url: s.image_url,
      })),
    };
  }
}

@ApiTags('admin-lab-services')
@ApiBearerAuth()
@Roles('lab_manager') // super_admin always passes
@Controller('admin/lab-services')
export class AdminLabServicesController {
  constructor(private readonly svc: LabServicesService) {}

  @Get() list() { return this.svc.list(false); }

  @Post('categories') createCategory(@CurrentUser() u: AuthUser, @Body() dto: CreateCategoryDto) { return this.svc.createCategory(u.id, dto); }
  @Patch('categories/:id')
  updateCategory(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) { return this.svc.updateCategory(u.id, id, dto); }
  @Delete('categories/:id') deleteCategory(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteCategory(u.id, id); }

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateServiceDto) { return this.svc.createService(u.id, dto); }
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) {
    return this.svc.updateService(u.id, id, dto);
  }

  @Post(':id/image')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024, files: 1 } }))
  setImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) { return this.svc.setImage(id, file); }

  @Delete(':id/image') clearImage(@Param('id', ParseUUIDPipe) id: string) { return this.svc.clearImage(id); }
}
