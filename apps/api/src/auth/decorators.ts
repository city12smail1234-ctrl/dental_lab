import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export type AppRole =
  | 'super_admin' | 'lab_manager' | 'technician' | 'order_manager' | 'delivery_coordinator'
  | 'accountant' | 'inventory_manager' | 'delivery_staff' | 'doctor';

export interface AuthUser { id: string; email?: string; roles: AppRole[] }

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
/** Allowed roles. super_admin always passes. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
