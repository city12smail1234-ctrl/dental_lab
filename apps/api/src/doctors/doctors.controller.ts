import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { SetDoctorStatusDto, UpdateDoctorProfileDto } from './dto';
import { DoctorsService } from './doctors.service';

@ApiTags('doctors')
@ApiBearerAuth()
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly svc: DoctorsService) {}

  @Roles('doctor')
  @Get('me')
  me(@CurrentUser() u: AuthUser) { return this.svc.getMe(u.id); }

  @Roles('doctor')
  @Patch('me')
  update(@CurrentUser() u: AuthUser, @Body() dto: UpdateDoctorProfileDto) { return this.svc.updateMe(u.id, dto); }
}

@ApiTags('admin-doctors')
@ApiBearerAuth()
@Roles('lab_manager') // super_admin always passes
@Controller('admin/doctors')
export class AdminDoctorsController {
  constructor(private readonly svc: DoctorsService) {}

  @Get()
  list(@Query('status') status?: string, @Query('page') page?: string) {
    return this.svc.list(status, Math.max(1, Number(page) || 1));
  }

  @Patch(':id/status')
  setStatus(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetDoctorStatusDto) {
    return this.svc.setStatus(u.id, id, dto.status);
  }
}

@ApiTags('admin-stats')
@ApiBearerAuth()
@Roles('lab_manager')
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly svc: DoctorsService) {}

  @Get()
  stats() { return this.svc.stats(); }
}
