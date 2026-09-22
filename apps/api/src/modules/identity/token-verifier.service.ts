import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getEnv } from "../../config/env.js";
import { SupabaseAdminService } from "../../integrations/supabase/supabase-admin.service.js";

export interface VerifiedPrincipal {
  subject: string;
  tenantId?: string;
}

@Injectable()
export class TokenVerifierService {
  private readonly env = getEnv();
  private readonly jwks = this.env.OIDC_JWKS_URL
    ? createRemoteJWKSet(new URL(this.env.OIDC_JWKS_URL))
    : undefined;

  constructor(private readonly supabase: SupabaseAdminService) {}

  async verify(token: string): Promise<VerifiedPrincipal> {
    if (this.env.AUTH_MODE === "supabase") {
      try {
        const { data, error } = await this.supabase.client.auth.getUser(token);
        if (error || !data.user) throw new UnauthorizedException("Supabase access token is invalid");
        return { subject: data.user.id };
      } catch (error) {
        if (error instanceof UnauthorizedException) throw error;
        throw new UnauthorizedException("Supabase access token is invalid");
      }
    }
    if (!this.jwks || !this.env.OIDC_ISSUER_URL) throw new UnauthorizedException("OIDC is not configured");
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.env.OIDC_ISSUER_URL,
        audience: this.env.OIDC_AUDIENCE
      });
      if (!payload.sub || typeof payload.tenant_id !== "string") {
        throw new UnauthorizedException("Token must contain sub and tenant_id claims");
      }
      return { subject: payload.sub, tenantId: payload.tenant_id };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Access token is invalid");
    }
  }
}
