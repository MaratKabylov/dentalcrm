import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard, PermissionsGuard } from '../src/common/guards/rbac.guard';
import { StandardRole, PermissionKey, AuthContext } from '@dentalcrm/contracts';

describe('RBAC & Permissions Guard Specification', () => {
  let reflector: Reflector;
  let rolesGuard: RolesGuard;
  let permissionsGuard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    permissionsGuard = new PermissionsGuard(reflector);
  });

  function createMockContext(userPayload: Partial<AuthContext>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: userPayload,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  describe('RolesGuard', () => {
    it('should grant access if user has the required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([StandardRole.CLINIC_ADMIN]);

      const ctx = createMockContext({
        roles: [StandardRole.CLINIC_ADMIN],
      });

      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should throw ForbiddenException if user lacks the required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([StandardRole.CLINIC_ADMIN]);

      const ctx = createMockContext({
        roles: [StandardRole.DOCTOR],
      });

      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should grant access unconditionally to SUPER_ADMIN', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([StandardRole.CLINIC_ADMIN]);

      const ctx = createMockContext({
        roles: [StandardRole.SUPER_ADMIN],
      });

      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });
  });

  describe('PermissionsGuard', () => {
    it('should grant access if user has all required permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PermissionKey.AUDIT_READ]);

      const ctx = createMockContext({
        permissions: [PermissionKey.AUDIT_READ, PermissionKey.PATIENTS_READ],
      });

      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('should deny access (403 Forbidden) if doctor lacks audit.read permission', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PermissionKey.AUDIT_READ]);

      const ctx = createMockContext({
        roles: [StandardRole.DOCTOR],
        permissions: [PermissionKey.CLINICAL_WRITE, PermissionKey.PATIENTS_READ],
      });

      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
