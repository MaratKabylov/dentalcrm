import {
  createBranchSchema, createChairSchema, createDiagnosisCatalogSchema, createEmployeeSchema, createPriceListSchema,
  createRoomSchema, createServiceCategorySchema, createServiceSchema, renameResourceSchema,
  updateBranchSchema, updateDiagnosisCatalogSchema, updateServiceCatalogSchema, updateServiceCategorySchema, uuidSchema
} from "@dental/contracts";
import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { ClinicService } from "./clinic.service.js";

@ApiTags("clinic-core")
@ApiBearerAuth()
@Controller()
export class ClinicController {
  constructor(private readonly clinic: ClinicService) {}

  @Get("branches") @RequirePermissions("settings.manage")
  branches(@CurrentAuth() auth: AuthContext) { return this.clinic.listBranches(auth); }

  @Post("branches") @RequirePermissions("settings.manage")
  createBranch(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createBranch(auth, parseSchema(createBranchSchema, body));
  }

  @Patch("branches/:id") @RequirePermissions("settings.manage")
  updateBranch(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clinic.updateBranch(auth, parseSchema(uuidSchema, id), parseSchema(updateBranchSchema, body));
  }

  @Post("branches/:id/archive") @RequirePermissions("settings.manage")
  archiveBranch(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinic.archiveBranch(auth, parseSchema(uuidSchema, id));
  }

  @Get("rooms") @RequirePermissions("employees.read")
  rooms(@CurrentAuth() auth: AuthContext) { return this.clinic.listRooms(auth); }

  @Post("rooms") @RequirePermissions("employees.manage")
  createRoom(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createRoom(auth, parseSchema(createRoomSchema, body));
  }

  @Patch("rooms/:id") @RequirePermissions("employees.manage")
  updateRoom(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clinic.rename(auth, "room", parseSchema(uuidSchema, id), parseSchema(renameResourceSchema, body).name);
  }

  @Post("rooms/:id/archive") @RequirePermissions("employees.manage")
  archiveRoom(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinic.archive(auth, "room", parseSchema(uuidSchema, id));
  }

  @Get("chairs") @RequirePermissions("employees.read")
  chairs(@CurrentAuth() auth: AuthContext) { return this.clinic.listChairs(auth); }

  @Post("chairs") @RequirePermissions("employees.manage")
  createChair(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createChair(auth, parseSchema(createChairSchema, body));
  }

  @Patch("chairs/:id") @RequirePermissions("employees.manage")
  updateChair(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clinic.rename(auth, "chair", parseSchema(uuidSchema, id), parseSchema(renameResourceSchema, body).name);
  }

  @Post("chairs/:id/archive") @RequirePermissions("employees.manage")
  archiveChair(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinic.archive(auth, "chair", parseSchema(uuidSchema, id));
  }

  @Get("employees") @RequirePermissions("employees.read")
  employees(@CurrentAuth() auth: AuthContext) { return this.clinic.listEmployees(auth); }

  @Post("employees") @RequirePermissions("employees.manage")
  createEmployee(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createEmployee(auth, parseSchema(createEmployeeSchema, body));
  }

  @Post("employees/:id/archive") @RequirePermissions("employees.manage")
  archiveEmployee(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinic.archive(auth, "employee", parseSchema(uuidSchema, id));
  }

  @Get("service-categories") @RequirePermissions("catalog.read")
  serviceCategories(@CurrentAuth() auth: AuthContext) { return this.clinic.listServiceCategories(auth); }

  @Post("service-categories") @RequirePermissions("catalog.manage")
  createServiceCategory(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createServiceCategory(auth, parseSchema(createServiceCategorySchema, body));
  }

  @Patch("service-categories/:id") @RequirePermissions("catalog.manage")
  updateServiceCategory(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clinic.rename(auth, "service_category", parseSchema(uuidSchema, id),
      parseSchema(updateServiceCategorySchema, body).name);
  }

  @Post("service-categories/:id/archive") @RequirePermissions("catalog.manage")
  archiveServiceCategory(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinic.archive(auth, "service_category", parseSchema(uuidSchema, id));
  }

  @Get("services") @RequirePermissions("catalog.read")
  services(@CurrentAuth() auth: AuthContext) { return this.clinic.listServices(auth); }

  @Post("services") @RequirePermissions("catalog.manage")
  createService(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createService(auth, parseSchema(createServiceSchema, body));
  }

  @Patch("services/:id") @RequirePermissions("catalog.manage")
  updateService(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clinic.updateService(auth, parseSchema(uuidSchema, id), parseSchema(updateServiceCatalogSchema, body));
  }

  @Post("services/:id/archive") @RequirePermissions("catalog.manage")
  archiveService(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinic.archive(auth, "service", parseSchema(uuidSchema, id));
  }

  @Get("price-lists") @RequirePermissions("catalog.read")
  priceLists(@CurrentAuth() auth: AuthContext) { return this.clinic.listPriceLists(auth); }

  @Post("price-lists") @RequirePermissions("catalog.manage")
  createPriceList(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createPriceList(auth, parseSchema(createPriceListSchema, body));
  }

  @Post("price-lists/:id/archive") @RequirePermissions("catalog.manage")
  archivePriceList(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinic.archive(auth, "price_list", parseSchema(uuidSchema, id));
  }

  @Get("diagnoses") @RequirePermissions("clinical.read")
  diagnoses(@CurrentAuth() auth: AuthContext) { return this.clinic.listDiagnoses(auth); }

  @Post("diagnoses") @RequirePermissions("clinical.write")
  createDiagnosis(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createDiagnosis(auth, parseSchema(createDiagnosisCatalogSchema, body));
  }

  @Patch("diagnoses/:id") @RequirePermissions("clinical.write")
  updateDiagnosis(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clinic.rename(auth, "diagnosis", parseSchema(uuidSchema, id),
      parseSchema(updateDiagnosisCatalogSchema, body).name);
  }

  @Post("diagnoses/:id/archive") @RequirePermissions("clinical.write")
  archiveDiagnosis(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinic.archive(auth, "diagnosis", parseSchema(uuidSchema, id));
  }
}
