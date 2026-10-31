import { BadRequestException, Body, Controller, Delete, Get, Header, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/decorators';
import { sniff } from '../products/products.service';
import { SupabaseService } from '../supabase/supabase.service';

const BUCKET = 'works';
const MAX_IMAGES = 10;

class CreateWorkDto {
  @IsString() @MaxLength(120) title_ar: string;
  @IsString() @MaxLength(120) title_en: string;
  @IsOptional() @IsString() @MaxLength(2000) description_ar?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) description_en?: string | null;
  @IsOptional() @IsBoolean() is_published?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sort_order?: number;
}
class UpdateWorkDto extends PartialType(CreateWorkDto) {}

@Injectable()
export class WorksService {
  constructor(private readonly sb: SupabaseService) {}

  private url(path: string) { return this.sb.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl; }
  private audit(actor: string, action: string, id: string, details: object) {
    return this.sb.admin.from('audit_logs').insert({ actor_id: actor, action, entity: 'works', entity_id: id, details });
  }
  private shape(w: any) {
    const images = [...(w.work_images ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ id: i.id, url: this.url(i.storage_path) }));
    const { work_images, ...rest } = w;
    return { ...rest, images };
  }

  async list(onlyPublished: boolean) {
    let q = this.sb.admin.from('works').select('*, work_images(id,storage_path,sort_order)').order('sort_order').order('created_at', { ascending: false });
    if (onlyPublished) q = q.eq('is_published', true);
    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((w) => this.shape(w));
  }
  async get(id: string) {
    const { data, error } = await this.sb.admin.from('works').select('*, work_images(id,storage_path,sort_order)').eq('id', id).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException();
    return this.shape(data);
  }
  async create(actor: string, dto: CreateWorkDto) {
    const { data, error } = await this.sb.admin.from('works').insert(dto).select('id').single();
    if (error) throw new BadRequestException(error.message);
    await this.audit(actor, 'work.created', data.id, { title: dto.title_en });
    return this.get(data.id);
  }
  async update(actor: string, id: string, dto: UpdateWorkDto) {
    const { error } = await this.sb.admin.from('works').update(dto).eq('id', id);
    if (error) throw new BadRequestException(error.message);
    await this.audit(actor, 'work.updated', id, dto);
    return this.get(id);
  }
  async remove(actor: string, id: string) {
    const { data: imgs } = await this.sb.admin.from('work_images').select('storage_path').eq('work_id', id);
    if (imgs?.length) await this.sb.admin.storage.from(BUCKET).remove(imgs.map((i) => i.storage_path));
    const { error } = await this.sb.admin.from('works').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
    await this.audit(actor, 'work.deleted', id, {});
    return { deleted: true };
  }
  async addImage(id: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    const type = sniff(file.buffer);
    if (!type) throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');
    const w = await this.get(id);
    if (w.images.length >= MAX_IMAGES) throw new BadRequestException(`Maximum ${MAX_IMAGES} images per work`);
    const path = `works/${id}/${randomUUID()}.${type.ext}`;
    const up = await this.sb.admin.storage.from(BUCKET).upload(path, file.buffer, { contentType: type.mime, upsert: false });
    if (up.error) throw new BadRequestException(up.error.message);
    const { error } = await this.sb.admin.from('work_images').insert({ work_id: id, storage_path: path, sort_order: w.images.length });
    if (error) { await this.sb.admin.storage.from(BUCKET).remove([path]); throw new BadRequestException(error.message); }
    return this.get(id);
  }
  async removeImage(imageId: string) {
    const { data: img } = await this.sb.admin.from('work_images').select('work_id,storage_path').eq('id', imageId).maybeSingle();
    if (!img) throw new NotFoundException();
    await this.sb.admin.storage.from(BUCKET).remove([img.storage_path]);
    await this.sb.admin.from('work_images').delete().eq('id', imageId);
    return this.get(img.work_id);
  }
}

/** Visible to everyone, no login: only published works. */
@ApiTags('public')
@Controller('public')
export class PublicWorksController {
  constructor(private readonly svc: WorksService) {}
  @Public()
  @Get('works')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=60')
  async works() {
    return (await this.svc.list(true)).map((w: any) => ({ id: w.id, title_ar: w.title_ar, title_en: w.title_en, description_ar: w.description_ar, description_en: w.description_en, images: w.images.map((i: any) => i.url) }));
  }
}

@ApiTags('admin-works')
@ApiBearerAuth()
@Roles('lab_manager') // super_admin always passes
@Controller('admin/works')
export class AdminWorksController {
  constructor(private readonly svc: WorksService) {}
  @Get() list() { return this.svc.list(false); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateWorkDto) { return this.svc.create(u.id, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkDto) { return this.svc.update(u.id, id, dto); }
  @Delete('images/:imageId') removeImage(@Param('imageId', ParseUUIDPipe) id: string) { return this.svc.removeImage(id); }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u.id, id); }
  @Post(':id/images')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  addImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) { return this.svc.addImage(id, file); }
}

@Module({ controllers: [PublicWorksController, AdminWorksController], providers: [WorksService] })
export class WorksModule {}
