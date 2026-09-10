import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, PERMISSIONS_KEY } from '../decorators/rbac.decorator';
import { AuthContext, StandardRole, PermissionKey } from '@dentalcrm/contracts';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<(StandardRole | string)[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthContext;

    if (!user || !user.roles) {
      throw new ForbiddenException('Access denied: User has no roles assigned');
    }

    // Super Admin has unrestricted access
    if (user.roles.includes(StandardRole.SUPER_ADMIN)) {
      return true;
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException(`Access denied: Requires one of roles: [${requiredRoles.join(', ')}]`);
    }

    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<(PermissionKey | string)[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthContext;

    if (!user || !user.permissions) {
      throw new ForbiddenException('Access denied: User has no permissions');
    }

    // Super Admin has all permissions
    if (user.roles?.includes(StandardRole.SUPER_ADMIN)) {
      return true;
    }

    const hasAll = requiredPermissions.every((perm) => user.permissions.includes(perm));
    if (!hasAll) {
      throw new ForbiddenException(
        `Access denied: Missing required permission(s): [${requiredPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
