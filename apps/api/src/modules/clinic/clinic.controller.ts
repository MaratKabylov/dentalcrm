import {
  createChairSchema, createEmployeeSchema, createPriceListSchema, createRoomSchema, createServiceSchema
} from "@dental/contracts";
import { Body, Controller, Get, Post } from "@nestjs/common";
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

  @Get("rooms") @RequirePermissions("employees.read")
  rooms(@CurrentAuth() auth: AuthContext) { return this.clinic.listRooms(auth); }

  @Post("rooms") @RequirePermissions("employees.manage")
  createRoom(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createRoom(auth, parseSchema(createRoomSchema, body));
  }

  @Get("chairs") @RequirePermissions("employees.read")
  chairs(@CurrentAuth() auth: AuthContext) { return this.clinic.listChairs(auth); }

  @Post("chairs") @RequirePermissions("employees.manage")
  createChair(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createChair(auth, parseSchema(createChairSchema, body));
  }

  @Get("employees") @RequirePermissions("employees.read")
  employees(@CurrentAuth() auth: AuthContext) { return this.clinic.listEmployees(auth); }

  @Post("employees") @RequirePermissions("employees.manage")
  createEmployee(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createEmployee(auth, parseSchema(createEmployeeSchema, body));
  }

  @Get("services") @RequirePermissions("catalog.read")
  services(@CurrentAuth() auth: AuthContext) { return this.clinic.listServices(auth); }

  @Post("services") @RequirePermissions("catalog.manage")
  createService(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createService(auth, parseSchema(createServiceSchema, body));
  }

  @Get("price-lists") @RequirePermissions("catalog.read")
  priceLists(@CurrentAuth() auth: AuthContext) { return this.clinic.listPriceLists(auth); }

  @Post("price-lists") @RequirePermissions("catalog.manage")
  createPriceList(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinic.createPriceList(auth, parseSchema(createPriceListSchema, body));
  }
}
