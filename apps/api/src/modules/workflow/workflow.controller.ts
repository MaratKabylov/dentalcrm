import { createWorkflowRuleSchema,setWorkflowRuleActiveSchema,uuidSchema } from "@dental/contracts";
import { Body,Controller,Get,Param,Patch,Post } from "@nestjs/common";
import { ApiBearerAuth,ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { WorkflowService } from "./workflow.service.js";

@ApiTags("workflow") @ApiBearerAuth() @Controller("workflow")
export class WorkflowController {
  constructor(private readonly workflow:WorkflowService){}
  @Get("rules") @RequirePermissions("workflow.read")
  rules(@CurrentAuth() auth:AuthContext){return this.workflow.listRules(auth);}
  @Post("rules") @RequirePermissions("workflow.manage")
  createRule(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.workflow.createRule(auth,parseSchema(createWorkflowRuleSchema,body));}
  @Patch("rules/:id/active") @RequirePermissions("workflow.manage")
  active(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.workflow.setActive(auth,parseSchema(uuidSchema,id),parseSchema(setWorkflowRuleActiveSchema,body).active);}
  @Get("runs") @RequirePermissions("workflow.read")
  runs(@CurrentAuth() auth:AuthContext){return this.workflow.listRuns(auth);}
}
