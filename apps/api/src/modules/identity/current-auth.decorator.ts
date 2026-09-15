import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const auth = context.switchToHttp().getRequest<Request>().auth;
  if (!auth) throw new Error("Auth context is unavailable");
  return auth;
});
