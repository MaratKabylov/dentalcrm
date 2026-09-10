import { SetMetadata } from '@nestjs/common';
import { StandardRole, PermissionKey } from '@dentalcrm/contracts';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: (StandardRole | string)[]) => SetMetadata(ROLES_KEY, roles);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: (PermissionKey | string)[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
