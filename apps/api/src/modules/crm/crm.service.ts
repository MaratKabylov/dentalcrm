import type {
  ConvertLeadInput,CreateCrmActivityInput,CreateCrmCatalogItemInput,CreateLeadInput,CreateOpportunityInput,
  CreateOpportunityStageInput,TransitionOpportunityInput,UpdateLeadInput
} from "@dental/contracts";
import { HttpStatus,Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertBranchAccess,assertOrganizationAccess,organizationScopeSql,scopeValues } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

type CatalogTable="lead_sources"|"lead_channels";
interface ScopedRow {id:string;organizationId:string;branchId:string|null}
interface LeadRow extends ScopedRow {patientId:string|null;firstName:string;lastName:string|null;phone:string;email:string|null;
  status:string;interest:string|null;notes:string|null;sourceId:string|null;channelId:string|null;createdAt:Date}
interface OpportunityRow extends ScopedRow {leadId:string|null;patientId:string;treatmentPlanId:string|null;stageId:string;
  title:string;expectedAmountMinor:string|null;currency:string;lostReason:string|null;closedAt:Date|null;createdAt:Date}

const leadSelect=`l.id,l.organization_id AS "organizationId",l.branch_id AS "branchId",l.source_id AS "sourceId",
  l.channel_id AS "channelId",l.patient_id AS "patientId",l.first_name AS "firstName",l.last_name AS "lastName",
  l.phone,l.email,l.status,l.interest,l.notes,l.created_at AS "createdAt"`;
const opportunitySelect=`o.id,o.organization_id AS "organizationId",o.branch_id AS "branchId",o.lead_id AS "leadId",
  o.patient_id AS "patientId",o.treatment_plan_id AS "treatmentPlanId",o.stage_id AS "stageId",o.title,
  o.expected_amount_minor::text AS "expectedAmountMinor",o.currency,o.lost_reason AS "lostReason",o.closed_at AS "closedAt",o.created_at AS "createdAt"`;

@Injectable()
export class CrmService {
  constructor(private readonly database:DatabaseService,private readonly audit:AuditService,private readonly outbox:OutboxService){}

  listCatalog(auth:AuthContext,table:CatalogTable){const scope=this.catalogScope(auth,"c");return this.database.withTenant(auth,async(client)=>(await client.query(
    `SELECT c.id,c.organization_id AS "organizationId",o.name AS "organizationName",c.code,c.name,c.active
     FROM ${table} c JOIN organizations o ON o.id=c.organization_id WHERE c.active AND ${scope.sql} ORDER BY o.name,c.name`,scope.values)).rows);}

  createCatalog(auth:AuthContext,table:CatalogTable,input:CreateCrmCatalogItemInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId);
    return (await client.query(`INSERT INTO ${table}(tenant_id,organization_id,code,name,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$5) RETURNING id,organization_id AS "organizationId",code,name,active`,
      [auth.tenantId,input.organizationId,input.code,input.name,auth.userId])).rows[0];
  });}

  listStages(auth:AuthContext,organizationId?:string){return this.database.withTenant(auth,async(client)=>{
    if(organizationId){await assertOrganizationAccess(client,auth,organizationId);await this.ensureDefaultStages(client,auth,organizationId);}
    const scope=this.catalogScope(auth,"s"); return (await client.query(`SELECT s.id,s.organization_id AS "organizationId",o.name AS "organizationName",
      s.key,s.name,s.position,s.is_initial AS "isInitial",s.is_terminal AS "isTerminal",s.terminal_kind AS "terminalKind",s.is_system AS "isSystem"
      FROM opportunity_stages s JOIN organizations o ON o.id=s.organization_id WHERE s.active AND ${scope.sql}
      ${organizationId?`AND s.organization_id=$${scope.values.length+1}`:""} ORDER BY o.name,s.position`,
      organizationId?[...scope.values,organizationId]:scope.values)).rows;
  });}

  createStage(auth:AuthContext,input:CreateOpportunityStageInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId);
    return (await client.query(`INSERT INTO opportunity_stages(tenant_id,organization_id,key,name,position,is_terminal,terminal_kind,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,organization_id AS "organizationId",key,name,position,is_terminal AS "isTerminal",terminal_kind AS "terminalKind"`,
      [auth.tenantId,input.organizationId,input.key,input.name,input.position,input.isTerminal,input.terminalKind ?? null,auth.userId])).rows[0];
  });}

  listLeads(auth:AuthContext,status?:string,query?:string){const scope=this.operationalScope(auth,"l");return this.database.withTenant(auth,async(client)=>{
    const values=[...scope.values,status ?? null,query?`%${query}%`:null]; const offset=scope.values.length;
    const rows=(await client.query<LeadRow & Record<string,unknown>>(`SELECT ${leadSelect},s.name AS "sourceName",c.name AS "channelName",
      b.name AS "branchName" FROM leads l LEFT JOIN lead_sources s ON s.id=l.source_id LEFT JOIN lead_channels c ON c.id=l.channel_id
      LEFT JOIN branches b ON b.id=l.branch_id WHERE l.archived_at IS NULL AND ${scope.sql}
      AND ($${offset+1}::text IS NULL OR l.status=$${offset+1}) AND ($${offset+2}::text IS NULL OR
        concat_ws(' ',l.last_name,l.first_name,l.phone,l.email) ILIKE $${offset+2}) ORDER BY l.created_at DESC LIMIT 200`,values)).rows;
    return rows.map(serialize);
  });}

  getLead(auth:AuthContext,id:string){return this.database.withTenant(auth,async(client)=>serialize(await this.findLead(client,auth,id)));}

  createLead(auth:AuthContext,input:CreateLeadInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertInputScope(client,auth,input.organizationId,input.branchId);
    const row=(await client.query<LeadRow>(`INSERT INTO leads(tenant_id,organization_id,branch_id,source_id,channel_id,first_name,last_name,
      phone,phone_normalized,email,interest,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
      RETURNING ${leadSelect.replaceAll("l.","")}`,[auth.tenantId,input.organizationId,input.branchId ?? null,input.sourceId ?? null,
      input.channelId ?? null,input.firstName,input.lastName ?? null,input.phone,normalizePhone(input.phone),input.email ?? null,input.interest ?? null,
      input.notes ?? null,auth.userId])).rows[0]!;
    await this.record(client,auth,"lead.created","LeadCreated","lead",row.id,row,{leadId:row.id,organizationId:row.organizationId,branchId:row.branchId});
    return serialize(row);
  });}

  updateLead(auth:AuthContext,id:string,input:UpdateLeadInput){return this.database.withTenant(auth,async(client)=>{
    const before=await this.findLead(client,auth,id,true);if(["converted","lost"].includes(before.status))throw conflict("LEAD_TERMINAL","Converted or lost lead cannot be edited");
    const has=(key:string)=>Object.prototype.hasOwnProperty.call(input,key);
    const row=(await client.query<LeadRow>(`UPDATE leads SET source_id=CASE WHEN $2 THEN $3 ELSE source_id END,
      channel_id=CASE WHEN $4 THEN $5 ELSE channel_id END,first_name=COALESCE($6,first_name),last_name=CASE WHEN $7 THEN $8 ELSE last_name END,
      phone=COALESCE($9,phone),phone_normalized=CASE WHEN $9::text IS NULL THEN phone_normalized ELSE $10 END,
      email=CASE WHEN $11 THEN $12 ELSE email END,interest=CASE WHEN $13 THEN $14 ELSE interest END,notes=CASE WHEN $15 THEN $16 ELSE notes END,
      status=COALESCE($17,status),updated_at=now(),updated_by=$18,version=version+1 WHERE id=$1 RETURNING ${leadSelect.replaceAll("l.","")}`,
      [id,has("sourceId"),input.sourceId ?? null,has("channelId"),input.channelId ?? null,input.firstName ?? null,has("lastName"),input.lastName ?? null,
        input.phone ?? null,input.phone?normalizePhone(input.phone):null,has("email"),input.email ?? null,has("interest"),input.interest ?? null,
        has("notes"),input.notes ?? null,input.status ?? null,auth.userId])).rows[0]!;
    await this.record(client,auth,"lead.updated","LeadUpdated","lead",id,row,{leadId:id},before);return serialize(row);
  });}

  loseLead(auth:AuthContext,id:string,reason:string){return this.database.withTenant(auth,async(client)=>{
    const before=await this.findLead(client,auth,id,true);if(before.status==="converted")throw conflict("LEAD_ALREADY_CONVERTED","Converted lead cannot be lost");
    const row=(await client.query<LeadRow>(`UPDATE leads SET status='lost',lost_reason=$2,updated_at=now(),updated_by=$3,version=version+1
      WHERE id=$1 RETURNING ${leadSelect.replaceAll("l.","")}`,[id,reason,auth.userId])).rows[0]!;
    await this.record(client,auth,"lead.lost","LeadLost","lead",id,{...row,lostReason:reason},{leadId:id,reason},before);return serialize(row);
  });}

  convertLead(auth:AuthContext,id:string,input:ConvertLeadInput){return this.database.withTenant(auth,async(client)=>{
    const lead=await this.findLead(client,auth,id,true);if(lead.status==="converted")throw conflict("LEAD_ALREADY_CONVERTED","Lead is already converted");
    if(lead.status==="lost")throw conflict("LEAD_LOST","Lost lead must be reopened before conversion");
    let patientId=input.patientId;let patientCreated=false;
    if(patientId){if(!(await client.query("SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL",[patientId])).rows[0])throw notFound("PATIENT_NOT_FOUND","Patient not found");}
    else {const existing=(await client.query<{id:string}>("SELECT id FROM patients WHERE phone_normalized=$1 AND archived_at IS NULL LIMIT 1",[normalizePhone(lead.phone)])).rows[0];
      if(existing)patientId=existing.id;else {patientId=(await client.query<{id:string}>(`INSERT INTO patients(tenant_id,first_name,last_name,phone,phone_normalized,email,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,[auth.tenantId,lead.firstName,lead.lastName ?? "",lead.phone,normalizePhone(lead.phone),lead.email,auth.userId])).rows[0]!.id;patientCreated=true;}}
    const stageId=await this.initialStage(client,auth,lead.organizationId);
    const opportunity=(await client.query<OpportunityRow>(`INSERT INTO opportunities(tenant_id,organization_id,branch_id,lead_id,patient_id,stage_id,title,
      expected_amount_minor,currency,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      RETURNING ${opportunitySelect.replaceAll("o.","")}`,[auth.tenantId,lead.organizationId,lead.branchId,id,patientId,stageId,input.opportunityTitle,
      input.expectedAmountMinor ?? null,input.currency,auth.userId])).rows[0]!;
    await client.query(`INSERT INTO opportunity_stage_history(tenant_id,organization_id,opportunity_id,to_stage_id,changed_by)
      VALUES($1,$2,$3,$4,$5)`,[auth.tenantId,lead.organizationId,opportunity.id,stageId,auth.userId]);
    await client.query("UPDATE leads SET status='converted',patient_id=$2,converted_at=now(),updated_at=now(),updated_by=$3,version=version+1 WHERE id=$1",
      [id,patientId,auth.userId]);
    if(patientCreated)await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:"patient",aggregateId:patientId!,eventType:"PatientCreated",
      payload:{patientId:patientId!,organizationId:lead.organizationId,sourceLeadId:id},requestId:auth.requestId});
    await this.record(client,auth,"lead.converted","LeadConverted","lead",id,{patientId,opportunityId:opportunity.id},
      {leadId:id,patientId,opportunityId:opportunity.id,organizationId:lead.organizationId,branchId:lead.branchId},lead);
    await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:"opportunity",aggregateId:opportunity.id,eventType:"OpportunityCreated",
      payload:{opportunityId:opportunity.id,patientId,leadId:id,organizationId:lead.organizationId,branchId:lead.branchId},requestId:auth.requestId});
    return {leadId:id,patientId,patientCreated,opportunity:serialize(opportunity)};
  });}

  listOpportunities(auth:AuthContext,stageId?:string){const scope=this.operationalScope(auth,"o");return this.database.withTenant(auth,async(client)=>{
    const rows=(await client.query<OpportunityRow & Record<string,unknown>>(`SELECT ${opportunitySelect},s.name AS "stageName",s.key AS "stageKey",
      concat_ws(' ',p.last_name,p.first_name) AS "patientName",b.name AS "branchName" FROM opportunities o
      JOIN opportunity_stages s ON s.id=o.stage_id JOIN patients p ON p.id=o.patient_id LEFT JOIN branches b ON b.id=o.branch_id
      WHERE o.archived_at IS NULL AND ${scope.sql} ${stageId?`AND o.stage_id=$${scope.values.length+1}`:""} ORDER BY o.updated_at DESC LIMIT 200`,
      stageId?[...scope.values,stageId]:scope.values)).rows;return rows.map(serialize);
  });}

  getOpportunity(auth:AuthContext,id:string){return this.database.withTenant(auth,async(client)=>{
    const opportunity=await this.findOpportunity(client,auth,id);const history=(await client.query(`SELECT h.id,h.from_stage_id AS "fromStageId",
      fs.name AS "fromStageName",h.to_stage_id AS "toStageId",ts.name AS "toStageName",h.reason,h.changed_at AS "changedAt"
      FROM opportunity_stage_history h LEFT JOIN opportunity_stages fs ON fs.id=h.from_stage_id JOIN opportunity_stages ts ON ts.id=h.to_stage_id
      WHERE h.opportunity_id=$1 ORDER BY h.changed_at`,[id])).rows;return {...serialize(opportunity),history};
  });}

  createOpportunity(auth:AuthContext,input:CreateOpportunityInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertInputScope(client,auth,input.organizationId,input.branchId);await this.assertOpportunityLinks(client,input.organizationId,input.patientId,input.leadId,input.treatmentPlanId);
    const stageId=input.stageId ?? await this.initialStage(client,auth,input.organizationId);await this.assertStage(client,input.organizationId,stageId);
    const row=(await client.query<OpportunityRow>(`INSERT INTO opportunities(tenant_id,organization_id,branch_id,lead_id,patient_id,treatment_plan_id,
      stage_id,title,expected_amount_minor,currency,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
      RETURNING ${opportunitySelect.replaceAll("o.","")}`,[auth.tenantId,input.organizationId,input.branchId ?? null,input.leadId ?? null,input.patientId,
      input.treatmentPlanId ?? null,stageId,input.title,input.expectedAmountMinor ?? null,input.currency,auth.userId])).rows[0]!;
    await client.query("INSERT INTO opportunity_stage_history(tenant_id,organization_id,opportunity_id,to_stage_id,changed_by) VALUES($1,$2,$3,$4,$5)",
      [auth.tenantId,input.organizationId,row.id,stageId,auth.userId]);
    await this.record(client,auth,"opportunity.created","OpportunityCreated","opportunity",row.id,row,{opportunityId:row.id,patientId:row.patientId,
      organizationId:row.organizationId,branchId:row.branchId});return serialize(row);
  });}

  transitionOpportunity(auth:AuthContext,id:string,input:TransitionOpportunityInput){return this.database.withTenant(auth,async(client)=>{
    const before=await this.findOpportunity(client,auth,id,true);const current=await this.stage(client,before.organizationId,before.stageId);
    if(current.isTerminal)throw conflict("OPPORTUNITY_CLOSED","Closed opportunity cannot change stage");const target=await this.stage(client,before.organizationId,input.stageId);
    if(target.terminalKind==="lost" && !input.reason)throw new ApiException(HttpStatus.BAD_REQUEST,"LOSS_REASON_REQUIRED","Loss reason is required");
    const row=(await client.query<OpportunityRow>(`UPDATE opportunities SET stage_id=$2,lost_reason=CASE WHEN $3='lost' THEN $4 ELSE NULL END,
      closed_at=CASE WHEN $5 THEN now() ELSE NULL END,updated_at=now(),updated_by=$6,version=version+1 WHERE id=$1
      RETURNING ${opportunitySelect.replaceAll("o.","")}`,[id,input.stageId,target.terminalKind,input.reason ?? null,target.isTerminal,auth.userId])).rows[0]!;
    await client.query(`INSERT INTO opportunity_stage_history(tenant_id,organization_id,opportunity_id,from_stage_id,to_stage_id,reason,changed_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[auth.tenantId,before.organizationId,id,before.stageId,input.stageId,input.reason ?? null,auth.userId]);
    await this.record(client,auth,"opportunity.stage_changed","OpportunityStageChanged","opportunity",id,row,{opportunityId:id,fromStageId:before.stageId,
      toStageId:input.stageId,stageKey:target.key,patientId:before.patientId,organizationId:before.organizationId,branchId:before.branchId},before);return serialize(row);
  });}

  linkTreatmentPlan(auth:AuthContext,id:string,treatmentPlanId:string){return this.database.withTenant(auth,async(client)=>{
    const before=await this.findOpportunity(client,auth,id,true);if(!(await client.query("SELECT 1 FROM treatment_plans WHERE id=$1 AND organization_id=$2",[treatmentPlanId,before.organizationId])).rows[0])
      throw conflict("TREATMENT_PLAN_ORGANIZATION_MISMATCH","Treatment plan belongs to another organization");
    const after=(await client.query(`UPDATE opportunities SET treatment_plan_id=$2,updated_at=now(),updated_by=$3,version=version+1 WHERE id=$1
      RETURNING id,treatment_plan_id AS "treatmentPlanId"`,[id,treatmentPlanId,auth.userId])).rows[0]!;
    await this.record(client,auth,"opportunity.plan_linked","OpportunityTreatmentPlanLinked","opportunity",id,after,
      {opportunityId:id,treatmentPlanId,organizationId:before.organizationId},before);return after;
  });}

  listActivities(auth:AuthContext,filter:{leadId?:string;opportunityId?:string;patientId?:string}){const scope=this.operationalScope(auth,"a");return this.database.withTenant(auth,async(client)=>{
    const values=[...scope.values,filter.leadId ?? null,filter.opportunityId ?? null,filter.patientId ?? null];const n=scope.values.length;
    return (await client.query(`SELECT a.id,a.organization_id AS "organizationId",a.branch_id AS "branchId",a.lead_id AS "leadId",
      a.opportunity_id AS "opportunityId",a.patient_id AS "patientId",a.activity_type AS "activityType",a.direction,a.subject,a.body,
      a.occurred_at AS "occurredAt" FROM crm_activities a WHERE ${scope.sql} AND ($${n+1}::uuid IS NULL OR a.lead_id=$${n+1})
      AND ($${n+2}::uuid IS NULL OR a.opportunity_id=$${n+2}) AND ($${n+3}::uuid IS NULL OR a.patient_id=$${n+3})
      ORDER BY a.occurred_at DESC LIMIT 500`,values)).rows;
  });}

  createActivity(auth:AuthContext,input:CreateCrmActivityInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertInputScope(client,auth,input.organizationId,input.branchId);
    const row=(await client.query(`INSERT INTO crm_activities(tenant_id,organization_id,branch_id,lead_id,opportunity_id,patient_id,
      activity_type,direction,subject,body,occurred_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id,organization_id AS "organizationId",branch_id AS "branchId",lead_id AS "leadId",opportunity_id AS "opportunityId",
      patient_id AS "patientId",activity_type AS "activityType",direction,subject,body,occurred_at AS "occurredAt"`,
      [auth.tenantId,input.organizationId,input.branchId ?? null,input.leadId ?? null,input.opportunityId ?? null,input.patientId ?? null,
        input.activityType,input.direction ?? null,input.subject ?? null,input.body,auth.userId])).rows[0]!;
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action:"crm_activity.created",entityType:"crm_activity",
      entityId:String(row.id),after:row,requestId:auth.requestId});return row;
  });}

  private catalogScope(auth:AuthContext,alias:string){return auth.tenantWide?{sql:"TRUE",values:[] as unknown[]}:
    {sql:organizationScopeSql(alias),values:scopeValues(auth)};}
  private operationalScope(auth:AuthContext,alias:string){if(auth.tenantWide)return{sql:"TRUE",values:[] as unknown[]};
    return{sql:`(${alias}.organization_id=ANY($1::uuid[]) OR ${alias}.branch_id=ANY($2::uuid[]))`,values:scopeValues(auth)};}
  private async assertInputScope(client:PoolClient,auth:AuthContext,organizationId:string,branchId?:string){
    if(branchId){const actual=await assertBranchAccess(client,auth,branchId);if(actual!==organizationId)throw conflict("BRANCH_ORGANIZATION_MISMATCH","Branch belongs to another organization");}
    else await assertOrganizationAccess(client,auth,organizationId,false);
  }
  private async assertRowAccess(client:PoolClient,auth:AuthContext,row:ScopedRow){if(row.branchId)await assertBranchAccess(client,auth,row.branchId);
    else await assertOrganizationAccess(client,auth,row.organizationId,false);}
  private async findLead(client:PoolClient,auth:AuthContext,id:string,lock=false){const row=(await client.query<LeadRow>(`SELECT ${leadSelect}
    FROM leads l WHERE l.id=$1 AND l.archived_at IS NULL${lock?" FOR UPDATE":""}`,[id])).rows[0];if(!row)throw notFound("LEAD_NOT_FOUND","Lead not found");
    await this.assertRowAccess(client,auth,row);return row;}
  private async findOpportunity(client:PoolClient,auth:AuthContext,id:string,lock=false){const row=(await client.query<OpportunityRow>(`SELECT ${opportunitySelect}
    FROM opportunities o WHERE o.id=$1 AND o.archived_at IS NULL${lock?" FOR UPDATE":""}`,[id])).rows[0];if(!row)throw notFound("OPPORTUNITY_NOT_FOUND","Opportunity not found");
    await this.assertRowAccess(client,auth,row);return row;}
  private async assertOpportunityLinks(client:PoolClient,organizationId:string,patientId:string,leadId?:string,treatmentPlanId?:string){
    if(!(await client.query("SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL",[patientId])).rows[0])throw notFound("PATIENT_NOT_FOUND","Patient not found");
    if(leadId && !(await client.query("SELECT 1 FROM leads WHERE id=$1 AND organization_id=$2 AND archived_at IS NULL",[leadId,organizationId])).rows[0])
      throw conflict("LEAD_ORGANIZATION_MISMATCH","Lead belongs to another organization");
    if(treatmentPlanId && !(await client.query("SELECT 1 FROM treatment_plans WHERE id=$1 AND organization_id=$2",[treatmentPlanId,organizationId])).rows[0])
      throw conflict("TREATMENT_PLAN_ORGANIZATION_MISMATCH","Treatment plan belongs to another organization");
  }
  private async ensureDefaultStages(client:PoolClient,auth:AuthContext,organizationId:string){await client.query(`INSERT INTO opportunity_stages
    (tenant_id,organization_id,key,name,position,is_initial,is_terminal,terminal_kind,is_system) VALUES
    ($1,$2,'new','New',0,true,false,NULL,true),($1,$2,'contacted','Contacted',10,false,false,NULL,true),
    ($1,$2,'appointment_booked','Appointment booked',20,false,false,NULL,true),($1,$2,'visited','Visited',30,false,false,NULL,true),
    ($1,$2,'plan_created','Plan created',40,false,false,NULL,true),($1,$2,'plan_presented','Plan presented',50,false,false,NULL,true),
    ($1,$2,'accepted','Accepted',60,false,false,NULL,true),($1,$2,'in_treatment','In treatment',70,false,false,NULL,true),
    ($1,$2,'won','Won',80,false,true,'won',true),($1,$2,'lost','Lost',90,false,true,'lost',true)
    ON CONFLICT(tenant_id,organization_id,key) DO NOTHING`,[auth.tenantId,organizationId]);}
  private async initialStage(client:PoolClient,auth:AuthContext,organizationId:string){await this.ensureDefaultStages(client,auth,organizationId);
    return (await client.query<{id:string}>("SELECT id FROM opportunity_stages WHERE organization_id=$1 AND is_initial AND active",[organizationId])).rows[0]!.id;}
  private async assertStage(client:PoolClient,organizationId:string,stageId:string){await this.stage(client,organizationId,stageId);}
  private async stage(client:PoolClient,organizationId:string,stageId:string){const row=(await client.query<{key:string;isTerminal:boolean;terminalKind:string|null}>(
    `SELECT key,is_terminal AS "isTerminal",terminal_kind AS "terminalKind" FROM opportunity_stages WHERE id=$1 AND organization_id=$2 AND active`,[stageId,organizationId])).rows[0];
    if(!row)throw conflict("OPPORTUNITY_STAGE_MISMATCH","Stage belongs to another organization or is inactive");return row;}
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,entityType:string,id:string,after:unknown,payload:Record<string,unknown>,before?:unknown){
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType,entityId:id,...(before===undefined?{}:{before}),after,requestId:auth.requestId});
    await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,aggregateId:id,eventType,payload,requestId:auth.requestId});
  }
}

function serialize(row:object){const result:Record<string,unknown>={...row};if(result.createdAt instanceof Date)result.createdAt=result.createdAt.toISOString();
  if(result.closedAt instanceof Date)result.closedAt=result.closedAt.toISOString();if(typeof result.expectedAmountMinor==="string")result.expectedAmountMinor=Number(result.expectedAmountMinor);return result;}
function normalizePhone(value:string){return value.replace(/\D/g,"");}
function notFound(code:string,message:string){return new ApiException(HttpStatus.NOT_FOUND,code,message);}
function conflict(code:string,message:string){return new ApiException(HttpStatus.CONFLICT,code,message);}
