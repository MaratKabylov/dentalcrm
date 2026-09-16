import type { CreateWorkflowRuleInput } from "@dental/contracts";
import { HttpStatus,Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertBranchAccess,assertOrganizationAccess,organizationScopeSql,scopeValues } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

@Injectable()
export class WorkflowService {
  constructor(private readonly database:DatabaseService,private readonly audit:AuditService,private readonly outbox:OutboxService){}

  listRules(auth:AuthContext){const scope=this.scope(auth,"r");return this.database.withTenant(auth,async(client)=>{
    const rows=(await client.query<Record<string,unknown>>(`SELECT r.id,r.organization_id AS "organizationId",o.name AS "organizationName",
      r.name,r.event_type AS "eventType",r.delay_seconds AS "delaySeconds",r.active,r.version,
      COALESCE(json_agg(DISTINCT jsonb_build_object('id',c.id,'fieldPath',c.field_path,'operator',c.operator,'expectedValue',c.expected_value,
        'position',c.position)) FILTER(WHERE c.id IS NOT NULL),'[]') AS conditions,
      COALESCE(json_agg(DISTINCT jsonb_build_object('id',a.id,'actionType',a.action_type,'configuration',a.configuration,
        'position',a.position)) FILTER(WHERE a.id IS NOT NULL),'[]') AS actions
      FROM workflow_rules r JOIN organizations o ON o.id=r.organization_id
      LEFT JOIN workflow_rule_conditions c ON c.rule_id=r.id LEFT JOIN workflow_rule_actions a ON a.rule_id=r.id
      WHERE r.archived_at IS NULL AND ${scope.sql} GROUP BY r.id,o.name ORDER BY o.name,r.name`,scope.values)).rows;
    return rows.map((row)=>({...row,conditions:sortPosition(row.conditions),actions:sortPosition(row.actions)}));
  });}

  createRule(auth:AuthContext,input:CreateWorkflowRuleInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);
    for(const action of input.actions)await this.assertActionConfig(client,auth,input.organizationId,action.configuration);
    const rule=(await client.query<{id:string}&Record<string,unknown>>(`INSERT INTO workflow_rules(tenant_id,organization_id,name,event_type,
      delay_seconds,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6)
      RETURNING id,organization_id AS "organizationId",name,event_type AS "eventType",delay_seconds AS "delaySeconds",active`,
      [auth.tenantId,input.organizationId,input.name,input.eventType,input.delaySeconds,auth.userId])).rows[0]!;
    for(const [position,condition] of input.conditions.entries())await client.query(`INSERT INTO workflow_rule_conditions
      (tenant_id,organization_id,rule_id,field_path,operator,expected_value,position) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [auth.tenantId,input.organizationId,rule.id,condition.fieldPath,condition.operator,
        condition.expectedValue===undefined?null:JSON.stringify(condition.expectedValue),position]);
    for(const [position,action] of input.actions.entries())await client.query(`INSERT INTO workflow_rule_actions
      (tenant_id,organization_id,rule_id,action_type,configuration,position) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
      [auth.tenantId,input.organizationId,rule.id,action.actionType,JSON.stringify(action.configuration),position]);
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action:"workflow_rule.created",entityType:"workflow_rule",
      entityId:rule.id,after:{...rule,conditions:input.conditions,actions:input.actions},requestId:auth.requestId});
    await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:"workflow_rule",aggregateId:rule.id,eventType:"WorkflowRuleCreated",
      payload:{workflowRuleId:rule.id,organizationId:input.organizationId},requestId:auth.requestId});return {...rule,conditions:input.conditions,actions:input.actions};
  });}

  setActive(auth:AuthContext,id:string,active:boolean){return this.database.withTenant(auth,async(client)=>{
    const before=(await client.query<{organizationId:string;active:boolean}>(`SELECT organization_id AS "organizationId",active FROM workflow_rules
      WHERE id=$1 AND archived_at IS NULL FOR UPDATE`,[id])).rows[0];if(!before)throw new ApiException(HttpStatus.NOT_FOUND,"WORKFLOW_RULE_NOT_FOUND","Workflow rule not found");
    await assertOrganizationAccess(client,auth,before.organizationId,false);const after=(await client.query(`UPDATE workflow_rules SET active=$2,updated_at=now(),
      updated_by=$3,version=version+1 WHERE id=$1 RETURNING id,active,version`,[id,active,auth.userId])).rows[0]!;
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action:"workflow_rule.active_changed",entityType:"workflow_rule",
      entityId:id,before,after,requestId:auth.requestId});return after;
  });}

  listRuns(auth:AuthContext){const scope=this.scope(auth,"w");return this.database.withTenant(auth,async(client)=>(await client.query(`SELECT w.id,
    w.organization_id AS "organizationId",r.name AS "ruleName",w.event_id AS "eventId",w.event_type AS "eventType",w.status,
    w.scheduled_at AS "scheduledAt",w.started_at AS "startedAt",w.finished_at AS "finishedAt",w.attempts,w.last_error AS "lastError"
    FROM workflow_runs w JOIN workflow_rules r ON r.id=w.rule_id WHERE ${scope.sql} ORDER BY w.created_at DESC LIMIT 200`,scope.values)).rows);}

  private scope(auth:AuthContext,alias:string){return auth.tenantWide?{sql:"TRUE",values:[] as unknown[]}:
    {sql:organizationScopeSql(alias),values:scopeValues(auth)};}
  private async assertActionConfig(client:PoolClient,auth:AuthContext,organizationId:string,config:CreateWorkflowRuleInput["actions"][number]["configuration"]){
    if(config.branchId){const actual=await assertBranchAccess(client,auth,config.branchId);if(actual!==organizationId)throw new ApiException(HttpStatus.CONFLICT,
      "WORKFLOW_BRANCH_SCOPE_MISMATCH","Workflow task branch belongs to another organization");}
    if(config.assignedEmployeeId){const allowed=(await client.query(`SELECT 1 FROM employee_branches eb JOIN branches b ON b.id=eb.branch_id
      WHERE eb.employee_id=$1 AND b.organization_id=$2 AND ($3::uuid IS NULL OR b.id=$3) LIMIT 1`,
      [config.assignedEmployeeId,organizationId,config.branchId ?? null])).rows[0];if(!allowed)throw new ApiException(HttpStatus.CONFLICT,
      "WORKFLOW_ASSIGNEE_SCOPE_MISMATCH","Workflow task assignee is outside the organization or branch");}
  }
}
function sortPosition(value:unknown){return Array.isArray(value)?[...value].sort((a,b)=>Number((a as {position?:number}).position)-Number((b as {position?:number}).position)):[];}
