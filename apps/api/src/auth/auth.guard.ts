import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';
import { AppRole, IS_PUBLIC } from './decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sb: SupabaseService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException();

    const { data, error } = await this.sb.admin.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException();

    const { data: rows, error: rolesErr } = await this.sb.admin.from('user_roles').select('role').eq('user_id', data.user.id);
    if (rolesErr) throw new UnauthorizedException();

    req.user = { id: data.user.id, email: data.user.email, roles: (rows ?? []).map((r) => r.role as AppRole) };
    return true;
  }
}
