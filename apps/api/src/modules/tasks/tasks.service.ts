import type { CreateTaskInput,TransitionTaskInput } from "@dental/contracts";
import { HttpStatus,Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertBranchAccess,assertOrganizationAccess,scopeValues } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

interface TaskRow {id:string;organizationId:string;branchId:string|null;assignedEmployeeId:string|null;entityType:string|null;entityId:string|null;
  title:string;description:string|null;priority:string;status:string;dueAt:Date|null;completedAt:Date|null;source:string;createdAt:Date}
const select=`t.id,t.organization_id AS "organizationId",t.branch_id AS "branchId",t.assigned_employee_id AS "assignedEmployeeId",
  t.entity_type AS "entityType",t.entity_id AS "entityId",t.title,t.description,t.priority,t.status,t.due_at AS "dueAt",
  t.completed_at AS "completedAt",t.source,t.created_at AS "createdAt"`;
const transitions:Record<string,ReadonlySet<string>>={open:new Set(["in_progress","completed","cancelled"]),
  in_progress:new Set(["open","completed","cancelled"]),completed:new Set(),cancelled:new Set()};

@Injectable()
export class TasksService {
  constructor(private readonly database:DatabaseService,private readonly audit:AuditService,private readonly outbox:OutboxService){}

  list(auth:AuthContext,status?:string,employeeId?:string){const scope=this.scope(auth,"t");return this.database.withTenant(auth,async(client)=>{
    const values=[...scope.values,status ?? null,employeeId ?? null],n=scope.values.length;
    const rows=(await client.query<TaskRow & Record<string,unknown>>(`SELECT ${select},b.name AS "branchName",
      concat_ws(' ',e.last_name,e.first_name) AS "assignedEmployeeName" FROM tasks t LEFT JOIN branches b ON b.id=t.branch_id
      LEFT JOIN employees e ON e.id=t.assigned_employee_id WHERE t.archived_at IS NULL AND ${scope.sql}
      AND ($${n+1}::text IS NULL OR t.status=$${n+1}) AND ($${n+2}::uuid IS NULL OR t.assigned_employee_id=$${n+2})
      ORDER BY t.due_at NULLS LAST,t.created_at DESC LIMIT 300`,values)).rows;return rows.map(serialize);
  });}

  get(auth:AuthContext,id:string){return this.database.withTenant(auth,async(client)=>{const task=await this.find(client,auth,id);
    const [comments,history]=await Promise.all([
      client.query(`SELECT id,body,author_user_id AS "authorUserId",created_at AS "createdAt" FROM task_comments WHERE task_id=$1 ORDER BY created_at`,[id]),
      client.query(`SELECT id,from_status AS "fromStatus",to_status AS "toStatus",reason,changed_by AS "changedBy",changed_at AS "changedAt"
        FROM task_status_history WHERE task_id=$1 ORDER BY changed_at`,[id])]);return {...serialize(task),comments:comments.rows,history:history.rows};
  });}

  create(auth:AuthContext,input:CreateTaskInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertInputScope(client,auth,input.organizationId,input.branchId);await this.assertAssignee(client,input.organizationId,input.assignedEmployeeId,input.branchId);
    const row=(await client.query<TaskRow>(`INSERT INTO tasks(tenant_id,organization_id,branch_id,assigned_employee_id,entity_type,entity_id,
      title,description,priority,due_at,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
      RETURNING ${select.replaceAll("t.","")}`,[auth.tenantId,input.organizationId,input.branchId ?? null,input.assignedEmployeeId ?? null,
      input.entityType ?? null,input.entityId ?? null,input.title,input.description ?? null,input.priority,input.dueAt ?? null,auth.userId])).rows[0]!;
    await client.query("INSERT INTO task_status_history(tenant_id,organization_id,task_id,to_status,changed_by) VALUES($1,$2,$3,'open',$4)",
      [auth.tenantId,input.organizationId,row.id,auth.userId]);await this.record(client,auth,"task.created","TaskCreated",row.id,row,
      {taskId:row.id,organizationId:row.organizationId,branchId:row.branchId,assignedEmployeeId:row.assignedEmployeeId});return serialize(row);
  });}

  transition(auth:AuthContext,id:string,input:TransitionTaskInput){return this.database.withTenant(auth,async(client)=>{
    const before=await this.find(client,auth,id,true);if(input.status===before.status)return serialize(before);
    if(!transitions[before.status]?.has(input.status))throw new ApiException(HttpStatus.CONFLICT,"INVALID_TASK_TRANSITION",
      `Cannot transition task from ${before.status} to ${input.status}`);
    if(input.status==="cancelled" && !input.reason)throw new ApiException(HttpStatus.BAD_REQUEST,"TASK_CANCELLATION_REASON_REQUIRED","Cancellation reason is required");
    const row=(await client.query<TaskRow>(`UPDATE tasks SET status=$2,completed_at=CASE WHEN $2='completed' THEN now() ELSE NULL END,
      completed_by=CASE WHEN $2='completed' THEN $3 ELSE NULL END,updated_at=now(),updated_by=$3,version=version+1 WHERE id=$1
      RETURNING ${select.replaceAll("t.","")}`,[id,input.status,auth.userId])).rows[0]!;
    await client.query(`INSERT INTO task_status_history(tenant_id,organization_id,task_id,from_status,to_status,reason,changed_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[auth.tenantId,before.organizationId,id,before.status,input.status,input.reason ?? null,auth.userId]);
    await this.record(client,auth,"task.status_changed","TaskStatusChanged",id,row,{taskId:id,fromStatus:before.status,toStatus:input.status,
      organizationId:before.organizationId,branchId:before.branchId},before);return serialize(row);
  });}

  comment(auth:AuthContext,id:string,body:string){return this.database.withTenant(auth,async(client)=>{const task=await this.find(client,auth,id);
    const row=(await client.query(`INSERT INTO task_comments(tenant_id,organization_id,task_id,body,author_user_id)
      VALUES($1,$2,$3,$4,$5) RETURNING id,task_id AS "taskId",body,author_user_id AS "authorUserId",created_at AS "createdAt"`,
      [auth.tenantId,task.organizationId,id,body,auth.userId])).rows[0]!;
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action:"task.comment_added",entityType:"task",entityId:id,
      after:{commentId:row.id},requestId:auth.requestId});return row;
  });}

  private scope(auth:AuthContext,alias:string){if(auth.tenantWide)return{sql:"TRUE",values:[] as unknown[]};return{
    sql:`(${alias}.organization_id=ANY($1::uuid[]) OR ${alias}.branch_id=ANY($2::uuid[]))`,values:scopeValues(auth)};}
  private async assertInputScope(client:PoolClient,auth:AuthContext,organizationId:string,branchId?:string){if(branchId){const actual=await assertBranchAccess(client,auth,branchId);
    if(actual!==organizationId)throw new ApiException(HttpStatus.CONFLICT,"BRANCH_ORGANIZATION_MISMATCH","Branch belongs to another organization");}
    else await assertOrganizationAccess(client,auth,organizationId,false);}
  private async assertRowAccess(client:PoolClient,auth:AuthContext,row:TaskRow){if(row.branchId)await assertBranchAccess(client,auth,row.branchId);
    else await assertOrganizationAccess(client,auth,row.organizationId,false);}
  private async assertAssignee(client:PoolClient,organizationId:string,employeeId?:string,branchId?:string){if(!employeeId)return;
    const allowed=(await client.query(`SELECT 1 FROM employee_branches eb JOIN branches b ON b.id=eb.branch_id
      WHERE eb.employee_id=$1 AND b.organization_id=$2 AND ($3::uuid IS NULL OR b.id=$3) LIMIT 1`,[employeeId,organizationId,branchId ?? null])).rows[0];
    if(!allowed)throw new ApiException(HttpStatus.CONFLICT,"TASK_ASSIGNEE_SCOPE_MISMATCH","Assignee does not work in the selected organization or branch");}
  private async find(client:PoolClient,auth:AuthContext,id:string,lock=false){const row=(await client.query<TaskRow>(`SELECT ${select} FROM tasks t
    WHERE t.id=$1 AND t.archived_at IS NULL${lock?" FOR UPDATE":""}`,[id])).rows[0];if(!row)throw new ApiException(HttpStatus.NOT_FOUND,"TASK_NOT_FOUND","Task not found");
    await this.assertRowAccess(client,auth,row);return row;}
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,id:string,after:unknown,payload:Record<string,unknown>,before?:unknown){
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType:"task",entityId:id,...(before===undefined?{}:{before}),after,requestId:auth.requestId});
    await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:"task",aggregateId:id,eventType,payload,requestId:auth.requestId});}
}
function serialize(row:object){const result:Record<string,unknown>={...row};for(const key of ["createdAt","dueAt","completedAt"])
  if(result[key] instanceof Date)result[key]=(result[key] as Date).toISOString();return result;}
