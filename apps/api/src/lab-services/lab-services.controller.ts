import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
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
