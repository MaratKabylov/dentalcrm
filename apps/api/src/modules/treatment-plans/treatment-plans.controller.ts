import { acceptTreatmentPlanSchema, createTreatmentPlanSchema, uuidSchema } from "@dental/contracts";
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { TreatmentPlansService } from "./treatment-plans.service.js";

@ApiTags("treatment-plans") @ApiBearerAuth() @Controller("treatment-plans")
export class TreatmentPlansController {
  constructor(private readonly plans: TreatmentPlansService) {}

  @Post() @RequirePermissions("treatment_plans.manage")
  create(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.plans.create(auth, parseSchema(createTreatmentPlanSchema, body));
  }

  @Get(":id") @RequirePermissions("treatment_plans.read")
  get(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.plans.get(auth, parseSchema(uuidSchema, id));
  }

  @Post(":id/present") @RequirePermissions("treatment_plans.manage")
  present(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.plans.present(auth, parseSchema(uuidSchema, id));
  }

  @Post(":id/accept") @RequirePermissions("treatment_plans.manage")
  accept(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.plans.accept(auth, parseSchema(uuidSchema, id), parseSchema(acceptTreatmentPlanSchema, body));
  }
}
