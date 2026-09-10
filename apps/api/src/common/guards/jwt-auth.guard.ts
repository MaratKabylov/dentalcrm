import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/rbac.decorator';
import { AuthContext } from '@dentalcrm/contracts';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication token missing or invalid');
    }

    const token = authHeader.substring(7);
    try {
      const payload = await this.jwtService.verifyAsync<AuthContext>(token, {
        secret: process.env.JWT_SECRET || 'super-secret-dentalcrm-key-change-in-production-2026',
      });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Session expired or token invalid');
    }
  }
}
