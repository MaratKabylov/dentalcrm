import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "./current-auth.decorator.js";
import type { AuthContext } from "./auth-context.js";

@ApiTags("identity")
@ApiBearerAuth()
@Controller("me")
export class IdentityController {
  @Get()
  getContext(@CurrentAuth() auth: AuthContext) {
    return {
      tenantId: auth.tenantId,
      userId: auth.userId,
      membershipId: auth.membershipId,
      permissions: [...auth.permissions].sort()
    };
  }
}
