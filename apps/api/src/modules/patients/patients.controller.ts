import { createPatientSchema, updatePatientSchema, uuidSchema } from "@dental/contracts";
import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { PatientsService } from "./patients.service.js";

@ApiTags("patients")
@ApiBearerAuth()
@Controller("patients")
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get() @RequirePermissions("patients.read")
  list(@CurrentAuth() auth: AuthContext, @Query("q") query?: string) {
    return this.patients.list(auth, parseSchema(z.string().trim().max(120).optional(), query));
  }

  @Get(":id") @RequirePermissions("patients.read")
  get(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.patients.get(auth, parseSchema(uuidSchema, id));
  }

  @Post() @RequirePermissions("patients.create")
  create(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.patients.create(auth, parseSchema(createPatientSchema, body));
  }

  @Patch(":id") @RequirePermissions("patients.update")
  update(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.patients.update(auth, parseSchema(uuidSchema, id), parseSchema(updatePatientSchema, body));
  }
}
