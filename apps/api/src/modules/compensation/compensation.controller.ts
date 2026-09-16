import {
  approvePayrollSchema, compensationRuleVersionSchema, createCompensationRuleSchema, createPayrollAdjustmentSchema,
  createPayrollPeriodSchema, createTimesheetSchema, rejectTimesheetSchema, uuidSchema
} from "@dental/contracts";
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { CompensationService } from "./compensation.service.js";

@ApiTags("compensation") @ApiBearerAuth() @Controller("compensation")
export class CompensationController {
  constructor(private readonly compensation:CompensationService) {}

  @Get("rules") @RequirePermissions("compensation.calculate")
  rules(@CurrentAuth() auth:AuthContext){return this.compensation.rules(auth);}
  @Post("rules") @RequirePermissions("compensation.calculate")
  createRule(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.compensation.createRule(auth,parseSchema(createCompensationRuleSchema,body));}
  @Post("rules/:id/versions") @RequirePermissions("compensation.calculate")
  addRuleVersion(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.compensation.addRuleVersion(auth,
    parseSchema(uuidSchema,id),parseSchema(compensationRuleVersionSchema,body));}

  @Post("timesheets") @RequirePermissions("compensation.calculate")
  createTimesheet(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.compensation.createTimesheet(auth,parseSchema(createTimesheetSchema,body));}
  @Post("timesheets/:id/submit") @RequirePermissions("compensation.calculate")
  submitTimesheet(@CurrentAuth() auth:AuthContext,@Param("id") id:string){return this.compensation.submitTimesheet(auth,parseSchema(uuidSchema,id));}
  @Post("timesheets/:id/approve") @RequirePermissions("compensation.approve")
  approveTimesheet(@CurrentAuth() auth:AuthContext,@Param("id") id:string){return this.compensation.approveTimesheet(auth,parseSchema(uuidSchema,id));}
  @Post("timesheets/:id/reject") @RequirePermissions("compensation.approve")
  rejectTimesheet(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.compensation.rejectTimesheet(auth,
    parseSchema(uuidSchema,id),parseSchema(rejectTimesheetSchema,body).reason);}

  @Post("payroll-periods") @RequirePermissions("compensation.calculate")
  createPeriod(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.compensation.createPeriod(auth,parseSchema(createPayrollPeriodSchema,body));}
  @Post("payroll-periods/:id/calculate") @RequirePermissions("compensation.calculate")
  calculate(@CurrentAuth() auth:AuthContext,@Param("id") id:string){return this.compensation.calculate(auth,parseSchema(uuidSchema,id));}
  @Post("payroll-periods/:id/adjustments") @RequirePermissions("compensation.calculate")
  adjustment(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.compensation.addAdjustment(auth,
    parseSchema(uuidSchema,id),parseSchema(createPayrollAdjustmentSchema,body));}
  @Post("payroll-periods/:id/approve") @RequirePermissions("compensation.approve")
  approve(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.compensation.approve(auth,
    parseSchema(uuidSchema,id),parseSchema(approvePayrollSchema,body).note);}
  @Get("payroll-periods/:id") @RequirePermissions("compensation.read_all")
  period(@CurrentAuth() auth:AuthContext,@Param("id") id:string){return this.compensation.period(auth,parseSchema(uuidSchema,id));}
  @Get("my-payroll") @RequirePermissions("compensation.read_own")
  own(@CurrentAuth() auth:AuthContext){return this.compensation.ownPayroll(auth);}
}
