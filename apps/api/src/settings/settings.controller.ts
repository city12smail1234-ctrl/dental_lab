import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { SettingsService } from './settings.service';

@ApiTags('admin-settings')
@ApiBearerAuth()
@Roles('lab_manager') // super_admin always passes
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}
  @Get() get() { return this.svc.getAll(); }
  @Put() put(@CurrentUser() u: AuthUser, @Body() body: unknown) { return this.svc.put(u.id, body); }
}
