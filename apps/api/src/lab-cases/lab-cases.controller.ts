import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { CaseStatusDto, CaseUpdateDto, CreateCaseDto, MessageDto, NoteDto } from './dto';
import { LabCasesService } from './lab-cases.service';

const UPLOAD = FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

@ApiTags('lab-cases')
@ApiBearerAuth()
@Roles('doctor')
@Controller('lab-cases')
export class LabCasesController {
  constructor(private readonly svc: LabCasesService) {}
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateCaseDto) { return this.svc.create(u.id, dto); }
  @Get() list(@CurrentUser() u: AuthUser, @Query('status') s?: string, @Query('search') q?: string) { return this.svc.mine(u.id, s, q); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.mineOne(u.id, id); }
  @Post(':id/messages') msg(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto) { return this.svc.message(u.id, id, dto.body); }
  @Post(':id/cancel') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancelMine(u.id, id); }

  @Post(':id/files') @ApiConsumes('multipart/form-data') @UseInterceptors(UPLOAD)
  upload(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() f?: Express.Multer.File) { return this.svc.doctorUpload(u.id, id, f); }
  @Get(':id/files/:fileId/url') fileUrl(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fid: string) { return this.svc.doctorFileUrl(u.id, id, fid); }
  @Delete(':id/files/:fileId') delFile(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fid: string) { return this.svc.doctorDeleteFile(u.id, id, fid); }
}

@ApiTags('admin-lab-cases')
@ApiBearerAuth()
@Roles('lab_manager', 'technician') // super_admin always passes; technicians only see assigned cases
@Controller('admin/lab-cases')
export class AdminLabCasesController {
  constructor(private readonly svc: LabCasesService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query('status') s?: string, @Query('search') q?: string, @Query('page') p?: string) {
    return this.svc.adminList(u, s, q, Math.max(1, Number(p) || 1));
  }
  @Get('technicians') technicians() { return this.svc.technicians(); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.adminGet(u, id); }
  @Post(':id/status') status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CaseStatusDto) { return this.svc.setStatus(u, id, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CaseUpdateDto) { return this.svc.update(u, id, dto); }
  @Post(':id/notes') note(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) { return this.svc.addNote(u, id, dto); }

  @Post(':id/files') @ApiConsumes('multipart/form-data') @UseInterceptors(UPLOAD)
  upload(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() f?: Express.Multer.File) { return this.svc.staffUpload(u, id, f); }
  @Get(':id/files/:fileId/url') fileUrl(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fid: string) { return this.svc.staffFileUrl(u, id, fid); }
  @Delete(':id/files/:fileId') delFile(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fid: string) { return this.svc.staffDeleteFile(u, id, fid); }
}
