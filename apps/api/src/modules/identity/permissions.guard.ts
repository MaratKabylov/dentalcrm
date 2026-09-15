import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { REQUIRED_PERMISSIONS } from "./permissions.decorator.js";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required?.length) return true;
    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (!auth || required.some((permission) => !auth.permissions.has(permission))) {
      throw new ForbiddenException("Required permission is missing");
    }
    return true;
  }
}
