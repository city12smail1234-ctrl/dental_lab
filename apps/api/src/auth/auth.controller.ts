import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from './decorators';
import { SupabaseService } from '../supabase/supabase.service';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly sb: SupabaseService) {}

  /** Returns the caller's identity, roles and doctor approval status. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const { data: doctor } = await this.sb.admin
      .from('doctor_profiles').select('status, clinic_name').eq('user_id', user.id).maybeSingle();
    return { id: user.id, email: user.email, roles: user.roles, doctor };
  }
}
