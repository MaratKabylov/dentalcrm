import { createTaskCommentSchema,createTaskSchema,transitionTaskSchema,uuidSchema } from "@dental/contracts";
import { Body,Controller,Get,Param,Post,Query } from "@nestjs/common";
import { ApiBearerAuth,ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { TasksService } from "./tasks.service.js";

@ApiTags("tasks") @ApiBearerAuth() @Controller("tasks")
export class TasksController {
  constructor(private readonly tasks:TasksService){}
  @Get() @RequirePermissions("tasks.read")
  list(@CurrentAuth() auth:AuthContext,@Query("status") status?:string,@Query("assignedEmployeeId") employeeId?:string){
    return this.tasks.list(auth,status,employeeId?parseSchema(uuidSchema,employeeId):undefined);
  }
  @Post() @RequirePermissions("tasks.manage")
  create(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.tasks.create(auth,parseSchema(createTaskSchema,body));}
  @Get(":id") @RequirePermissions("tasks.read")
  get(@CurrentAuth() auth:AuthContext,@Param("id") id:string){return this.tasks.get(auth,parseSchema(uuidSchema,id));}
  @Post(":id/transition") @RequirePermissions("tasks.manage")
  transition(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.tasks.transition(auth,parseSchema(uuidSchema,id),parseSchema(transitionTaskSchema,body));}
  @Post(":id/comments") @RequirePermissions("tasks.manage")
  comment(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.tasks.comment(auth,parseSchema(uuidSchema,id),parseSchema(createTaskCommentSchema,body).body);}
}
