import { createAdminRoleSchema,updateMembershipAccessSchema,uuidSchema } from "@dental/contracts";
import { Body,Controller,Get,Param,Patch,Post } from "@nestjs/common";
import { ApiBearerAuth,ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { AdministrationService } from "./administration.service.js";

@ApiTags("administration") @ApiBearerAuth() @Controller("admin") @RequirePermissions("settings.manage")
export class AdministrationController {
  constructor(private readonly administration:AdministrationService){}
  @Get("access") access(@CurrentAuth() auth:AuthContext){return this.administration.access(auth);}
  @Post("roles") createRole(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.administration.createRole(auth,parseSchema(createAdminRoleSchema,body));}
  @Patch("memberships/:id/access") updateAccess(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){
    return this.administration.updateMembershipAccess(auth,parseSchema(uuidSchema,id),parseSchema(updateMembershipAccessSchema,body));}
}
