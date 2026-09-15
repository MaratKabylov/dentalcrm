import {
  appointmentRangeSchema, createAppointmentSchema, createScheduleShiftSchema, rescheduleAppointmentSchema,
  transitionAppointmentSchema, uuidSchema,
  type AppointmentStatus
} from "@dental/contracts";
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { SchedulingService } from "./scheduling.service.js";

@ApiTags("appointments")
@ApiBearerAuth()
@Controller("appointments")
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get() @RequirePermissions("appointments.read")
  list(@CurrentAuth() auth: AuthContext, @Query("from") from: string, @Query("to") to: string) {
    const range = parseSchema(appointmentRangeSchema, { from, to });
    return this.scheduling.list(auth, range.from, range.to);
  }

  @Post() @RequirePermissions("appointments.create")
  create(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.scheduling.create(auth, parseSchema(createAppointmentSchema, body));
  }

  @Get("schedule/shifts") @RequirePermissions("appointments.read")
  shifts(@CurrentAuth() auth: AuthContext, @Query("from") from: string, @Query("to") to: string) {
    const range = parseSchema(appointmentRangeSchema, { from, to });
    return this.scheduling.listShifts(auth, range.from, range.to);
  }

  @Post("schedule/shifts") @RequirePermissions("appointments.update")
  createShift(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.scheduling.createShift(auth, parseSchema(createScheduleShiftSchema, body));
  }

  @Post(":id/confirm") @RequirePermissions("appointments.update")
  confirm(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.transition(auth, id, "confirmed", {}); }

  @Post(":id/check-in") @RequirePermissions("appointments.update")
  checkIn(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.transition(auth, id, "checked_in", {}); }

  @Post(":id/start") @RequirePermissions("appointments.update")
  start(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.transition(auth, id, "in_progress", {}); }

  @Post(":id/complete") @RequirePermissions("appointments.update")
  complete(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.transition(auth, id, "completed", {}); }

  @Post(":id/no-show") @RequirePermissions("appointments.update")
  noShow(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.transition(auth, id, "no_show", {}); }

  @Post(":id/cancel") @RequirePermissions("appointments.cancel")
  cancel(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.transition(auth, id, "cancelled", body);
  }

  @Post(":id/reschedule") @RequirePermissions("appointments.update")
  reschedule(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.scheduling.reschedule(auth, parseSchema(uuidSchema, id), parseSchema(rescheduleAppointmentSchema, body));
  }

  private transition(auth: AuthContext, id: string, status: AppointmentStatus, body: unknown) {
    const parsedId = parseSchema(uuidSchema, id);
    const command = parseSchema(transitionAppointmentSchema, body);
    return this.scheduling.transition(auth, parsedId, status, command.reason);
  }
}
