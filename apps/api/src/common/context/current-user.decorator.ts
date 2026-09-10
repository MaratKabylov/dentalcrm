import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthContext } from '@dentalcrm/contracts';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthContext;

    return data && user ? user[data] : user;
  },
);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenantId || (request.headers['x-tenant-id'] as string) || '';
  },
);
