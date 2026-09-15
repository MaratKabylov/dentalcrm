import { createOrganizationSchema, updateOrganizationSchema, uuidSchema, type CreateOrganizationInput } from "@dental/contracts";
import { Body, Controller, Get, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ApiException } from "../../common/http/api.exception.js";
import { parseSchema } from "../../common/http/parse-schema.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import type { AuthContext } from "../identity/auth-context.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { OrganizationsService } from "./organizations.service.js";

@ApiTags("organizations")
@ApiBearerAuth()
@RequirePermissions("settings.manage")
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @ApiOkResponse({ description: "Organizations visible inside the authenticated tenant" })
  list(@CurrentAuth() auth: AuthContext) {
    return this.organizations.list(auth);
  }

  @Post()
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "code"],
      properties: { name: { type: "string" }, code: { type: "string", pattern: "^[a-z0-9-]+$" } }
    }
  })
  @ApiCreatedResponse({ description: "Organization, audit event, and outbox event created atomically" })
  create(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const parsed = createOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Request validation failed", {
        issues: parsed.error.issues
      });
    }
    return this.organizations.create(auth, parsed.data as CreateOrganizationInput);
  }

  @Patch(":id")
  update(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.organizations.update(auth, parseSchema(uuidSchema, id), parseSchema(updateOrganizationSchema, body));
  }

  @Post(":id/archive")
  archive(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.organizations.archive(auth, parseSchema(uuidSchema, id));
  }
}
