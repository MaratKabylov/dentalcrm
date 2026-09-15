import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getEnv } from "../../config/env.js";

export interface VerifiedPrincipal {
  subject: string;
  tenantId: string;
}

@Injectable()
export class TokenVerifierService {
  private readonly env = getEnv();
  private readonly jwks = this.env.OIDC_JWKS_URL
    ? createRemoteJWKSet(new URL(this.env.OIDC_JWKS_URL))
    : undefined;

  async verify(token: string): Promise<VerifiedPrincipal> {
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
