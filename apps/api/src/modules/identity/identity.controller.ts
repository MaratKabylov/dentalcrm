import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "./current-auth.decorator.js";
import type { AuthContext } from "./auth-context.js";
import { DatabaseService } from "../../database/database.service.js";

@ApiTags("identity")
@ApiBearerAuth()
@Controller("me")
export class IdentityController {
  constructor(private readonly database:DatabaseService){}
  @Get()
  getContext(@CurrentAuth() auth: AuthContext) {
    return this.database.withTenant(auth,async(client)=>{const profile=(await client.query<{displayName:string;email:string|null;tenantName:string;tenantSlug:string}>(
      `SELECT u.display_name AS "displayName",u.email,t.name AS "tenantName",t.slug AS "tenantSlug" FROM users u CROSS JOIN tenants t
       WHERE u.id=$1 AND t.id=$2`,[auth.userId,auth.tenantId])).rows[0]!;return {
      tenantId: auth.tenantId,
      userId: auth.userId,
      membershipId: auth.membershipId,
      ...profile,
      permissions: [...auth.permissions].sort(),
      access: {
        tenantWide: auth.tenantWide,
        organizationIds: [...auth.organizationIds].sort(),
        branchIds: [...auth.branchIds].sort()
      }
    };});
  }
}
