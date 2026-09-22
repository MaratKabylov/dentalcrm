import { uuidSchema } from "@dental/contracts";
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { getEnv } from "../../config/env.js";
import { IdentityRepository } from "./identity.repository.js";
import { IS_PUBLIC } from "./public.decorator.js";
import { TokenVerifierService, type VerifiedPrincipal } from "./token-verifier.service.js";
import { LocalAuthService } from "./local-auth.service.js";
import { readSessionCookie } from "./session-cookie.js";
import { DatabaseService } from "../../database/database.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifierService,
    private readonly identity: IdentityRepository,
    private readonly localAuth: LocalAuthService,
    private readonly database: DatabaseService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const principal = await this.getPrincipal(request);
    const tenantId = principal.tenantId;
    if (!tenantId || !uuidSchema.safeParse(tenantId).success) throw new UnauthorizedException("Tenant is invalid");
    const membership = await this.identity.resolveMembership(tenantId, principal.subject);
    if (!membership) throw new UnauthorizedException("No active membership for this tenant");

    request.auth = {
      tenantId,
      subject: principal.subject,
      userId: membership.userId,
      membershipId: membership.membershipId,
      permissions: membership.permissions,
      tenantWide: membership.tenantWide,
      organizationIds: membership.organizationIds,
      branchIds: membership.branchIds,
      requestId: request.requestId ?? "unknown"
    };
    return true;
  }

  private async getPrincipal(request: Request): Promise<VerifiedPrincipal> {
    const mode=getEnv().AUTH_MODE;
    if (mode === "development") {
      const tenantId = request.header("x-tenant-id");
      const subject = request.header("x-user-subject");
      if (!tenantId || !subject) throw new UnauthorizedException("Development auth headers are required");
      return { tenantId, subject };
    }
    if(mode==="local"){
      const token=readSessionCookie(request.header("cookie"));if(!token)throw new UnauthorizedException("Local session is required");
      return this.localAuth.verifySession(token);
    }
    const authorization = request.header("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException("Bearer token is required");
    const principal = await this.verifier.verify(authorization.slice(7));
    if (mode !== "supabase") return principal;
    const slug = request.header("x-tenant-slug")?.trim().toLowerCase();
    if (!slug || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) {
      throw new UnauthorizedException("Tenant slug is required");
    }
    const tenantId = await this.database.findActiveTenantIdBySlug(slug);
    if (!tenantId) throw new UnauthorizedException("Tenant is unavailable");
    return { ...principal, tenantId };
  }
}
