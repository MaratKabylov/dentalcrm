import type { AddLabCaseFileInput,CreateLaboratoryInput,CreateLabCaseInput,RecordLabInvoiceInput,TransitionLabCaseInput } from "@dental/contracts";
import { HttpStatus,Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertOrganizationAccess,organizationScopeSql,scopeValues } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

interface LabCaseRow {id:string;organizationId:string;laboratoryId:string;patientId:string;status:string}
const transitions:Record<string,ReadonlySet<string>>={ordered:new Set(["impression_taken","sent","cancelled"]),impression_taken:new Set(["sent","cancelled"]),
  sent:new Set(["in_production","received","cancelled"]),in_production:new Set(["received","rework","cancelled"]),
  received:new Set(["fitted","completed","rework","cancelled"]),fitted:new Set(["completed","rework","cancelled"]),
  completed:new Set(["rework"]),rework:new Set(["sent","in_production","cancelled"]),cancelled:new Set()};

@Injectable()
export class LaboratoryService {
  constructor(private readonly database:DatabaseService,private readonly audit:AuditService,private readonly outbox:OutboxService){}

  createLaboratory(auth:AuthContext,input:CreateLaboratoryInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);const row=(await client.query<{id:string}&Record<string,unknown>>(`INSERT INTO laboratories
      (tenant_id,organization_id,code,name,phone,email,address,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)
      RETURNING id,organization_id AS "organizationId",code,name,phone,email,address,active`,[auth.tenantId,input.organizationId,input.code,
      input.name,input.phone ?? null,input.email ?? null,input.address ?? null,auth.userId])).rows[0]!;await this.record(client,auth,"laboratory.created",
      "LaboratoryCreated","laboratory",row.id,row,input.organizationId);return row;});}

  createCase(auth:AuthContext,input:CreateLabCaseInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);await this.assertCaseScope(client,input);
    const row=(await client.query<{id:string}>(`INSERT INTO lab_cases(tenant_id,organization_id,laboratory_id,patient_id,encounter_id,
      responsible_doctor_id,expected_at,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
      [auth.tenantId,input.organizationId,input.laboratoryId,input.patientId,input.encounterId ?? null,input.responsibleDoctorId,
      input.expectedAt ?? null,input.notes ?? null,auth.userId])).rows[0]!;const items=[];
    for(const item of input.items){const created=(await client.query(`INSERT INTO lab_case_items(tenant_id,organization_id,lab_case_id,procedure_id,
        treatment_plan_item_id,description,tooth_number,shade,cost_minor,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id,procedure_id AS "procedureId",treatment_plan_item_id AS "treatmentPlanItemId",description,tooth_number AS "toothNumber",shade,
        cost_minor::text AS "costMinor",currency`,[auth.tenantId,input.organizationId,row.id,item.procedureId ?? null,item.treatmentPlanItemId ?? null,
        item.description,item.toothNumber ?? null,item.shade ?? null,item.costMinor,item.currency])).rows[0]!;items.push(money(created));}
    await client.query(`INSERT INTO lab_case_status_events(tenant_id,organization_id,lab_case_id,to_status,actor_user_id)
      VALUES($1,$2,$3,'ordered',$4)`,[auth.tenantId,input.organizationId,row.id,auth.userId]);const result={id:row.id,...input,status:"ordered",items};
    await this.record(client,auth,"lab_case.created","LabCaseCreated","lab_case",row.id,result,input.organizationId);return result;});}

  listCases(auth:AuthContext,status?:string){const scope=auth.tenantWide?{sql:"TRUE",values:[] as unknown[]}:
    {sql:organizationScopeSql("c",1,2),values:scopeValues(auth)};const n=scope.values.length;return this.database.withTenant(auth,async(client)=>(await client.query(
      `SELECT c.id,c.organization_id AS "organizationId",c.status,c.expected_at AS "expectedAt",c.sent_at AS "sentAt",c.received_at AS "receivedAt",
       l.name AS "laboratoryName",concat_ws(' ',p.last_name,p.first_name) AS "patientName",concat_ws(' ',e.last_name,e.first_name) AS "doctorName"
       FROM lab_cases c JOIN laboratories l ON l.id=c.laboratory_id JOIN patients p ON p.id=c.patient_id JOIN doctors d ON d.id=c.responsible_doctor_id
       JOIN employees e ON e.id=d.employee_id WHERE ${scope.sql} AND ($${n+1}::text IS NULL OR c.status=$${n+1}) ORDER BY c.expected_at NULLS LAST,c.created_at DESC`,
      [...scope.values,status ?? null])).rows);}

  getCase(auth:AuthContext,id:string){return this.database.withTenant(auth,async(client)=>{const row=await this.find(client,auth,id);
    const detail=await client.query(`SELECT c.id,c.organization_id AS "organizationId",c.laboratory_id AS "laboratoryId",c.patient_id AS "patientId",
        c.encounter_id AS "encounterId",c.responsible_doctor_id AS "responsibleDoctorId",c.status,c.expected_at AS "expectedAt",c.sent_at AS "sentAt",
        c.received_at AS "receivedAt",c.completed_at AS "completedAt",c.notes,c.created_at AS "createdAt" FROM lab_cases c WHERE c.id=$1`,[id]),
      items=await client.query(`SELECT id,procedure_id AS "procedureId",treatment_plan_item_id AS "treatmentPlanItemId",description,tooth_number AS "toothNumber",
        shade,cost_minor::text AS "costMinor",currency FROM lab_case_items WHERE lab_case_id=$1 ORDER BY created_at,id`,[id]),
      events=await client.query(`SELECT id,from_status AS "fromStatus",to_status AS "toStatus",reason,occurred_at AS "occurredAt" FROM lab_case_status_events
        WHERE lab_case_id=$1 ORDER BY occurred_at,id`,[id]),
      files=await client.query(`SELECT id,kind,storage_key AS "storageKey",mime_type AS "mimeType",size_bytes::text AS "sizeBytes",checksum_sha256 AS "checksumSha256",
        created_at AS "createdAt" FROM lab_case_files WHERE lab_case_id=$1 ORDER BY created_at`,[id]),
      invoices=await client.query(`SELECT id,invoice_number AS "invoiceNumber",total_cost_minor::text AS "totalCostMinor",currency,issued_on AS "issuedOn",due_on AS "dueOn"
        FROM lab_invoices WHERE lab_case_id=$1 ORDER BY issued_on,id`,[id]);return {...detail.rows[0],items:items.rows.map(money),events:events.rows,
        files:files.rows.map(money),invoices:invoices.rows.map(money),organizationId:row.organizationId};});}

  transition(auth:AuthContext,id:string,input:TransitionLabCaseInput){return this.database.withTenant(auth,async(client)=>{const row=await this.find(client,auth,id,true);
    if(row.status===input.status)return {id,status:row.status};if(!transitions[row.status]?.has(input.status))throw conflict("INVALID_LAB_CASE_TRANSITION",
      `Cannot transition lab case from ${row.status} to ${input.status}`);if(["cancelled","rework"].includes(input.status) && !input.reason)
      throw bad("LAB_CASE_REASON_REQUIRED","A reason is required for cancellation or rework");const occurred=input.occurredAt ?? new Date().toISOString();
    const updated=(await client.query(`UPDATE lab_cases SET status=$2::varchar(24),sent_at=CASE WHEN $2::varchar(24)='sent' THEN $3::timestamptz ELSE sent_at END,
      received_at=CASE WHEN $2::varchar(24)='received' THEN $3::timestamptz ELSE received_at END,
      completed_at=CASE WHEN $2::varchar(24)='completed' THEN $3::timestamptz WHEN $2::varchar(24)='rework' THEN NULL ELSE completed_at END,
      updated_at=now(),updated_by=$4,version=version+1 WHERE id=$1 RETURNING id,status,sent_at AS "sentAt",received_at AS "receivedAt",
      completed_at AS "completedAt"`,[id,input.status,occurred,auth.userId])).rows[0]!;await client.query(`INSERT INTO lab_case_status_events
      (tenant_id,organization_id,lab_case_id,from_status,to_status,reason,actor_user_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [auth.tenantId,row.organizationId,id,row.status,input.status,input.reason ?? null,auth.userId,occurred]);const event=input.status==="received"?"LabCaseReceived":"LabCaseStatusChanged";
    await this.record(client,auth,`lab_case.${input.status}`,event,"lab_case",id,updated,row.organizationId,input.reason);return updated;});}

  addFile(auth:AuthContext,id:string,input:AddLabCaseFileInput){return this.database.withTenant(auth,async(client)=>{const row=await this.find(client,auth,id);
    const file=(await client.query(`INSERT INTO lab_case_files(tenant_id,organization_id,lab_case_id,kind,storage_key,mime_type,size_bytes,
      checksum_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,kind,storage_key AS "storageKey",mime_type AS "mimeType",
      size_bytes::text AS "sizeBytes",checksum_sha256 AS "checksumSha256",created_at AS "createdAt"`,[auth.tenantId,row.organizationId,id,input.kind,
      input.storageKey,input.mimeType,input.sizeBytes,input.checksumSha256.toLowerCase(),auth.userId])).rows[0]!;await this.record(client,auth,"lab_case.file_added",
      "LabCaseFileAdded","lab_case",id,{fileId:file.id},row.organizationId);return money(file);});}

  recordInvoice(auth:AuthContext,id:string,input:RecordLabInvoiceInput){return this.database.withTenant(auth,async(client)=>{const row=await this.find(client,auth,id);
    const invoice=(await client.query(`INSERT INTO lab_invoices(tenant_id,organization_id,lab_case_id,laboratory_id,invoice_number,total_cost_minor,
      currency,issued_on,due_on,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,invoice_number AS "invoiceNumber",
      total_cost_minor::text AS "totalCostMinor",currency,issued_on AS "issuedOn",due_on AS "dueOn"`,[auth.tenantId,row.organizationId,id,
      row.laboratoryId,input.invoiceNumber,input.totalCostMinor,input.currency,input.issuedOn,input.dueOn ?? null,auth.userId])).rows[0]!;
    await this.record(client,auth,"lab_invoice.recorded","LabInvoiceRecorded","lab_case",id,{invoiceId:invoice.id,totalCostMinor:input.totalCostMinor},
      row.organizationId);return money(invoice);});}

  private async find(client:PoolClient,auth:AuthContext,id:string,lock=false){const row=(await client.query<LabCaseRow>(`SELECT id,organization_id AS "organizationId",
    laboratory_id AS "laboratoryId",patient_id AS "patientId",status FROM lab_cases WHERE id=$1${lock?" FOR UPDATE":""}`,[id])).rows[0];
    if(!row)throw notFound("LAB_CASE_NOT_FOUND","Lab case not found");await assertOrganizationAccess(client,auth,row.organizationId,false);return row;}
  private async assertCaseScope(client:PoolClient,input:CreateLabCaseInput){if(!(await client.query("SELECT 1 FROM laboratories WHERE id=$1 AND organization_id=$2 AND active",
      [input.laboratoryId,input.organizationId])).rows[0])throw bad("LABORATORY_SCOPE_MISMATCH","Laboratory is outside the organization");
    if(!(await client.query(`SELECT 1 FROM doctors d JOIN employee_branches eb ON eb.employee_id=d.employee_id JOIN branches b ON b.id=eb.branch_id
      WHERE d.id=$1 AND b.organization_id=$2 LIMIT 1`,[input.responsibleDoctorId,input.organizationId])).rows[0])throw bad("LAB_DOCTOR_SCOPE_MISMATCH","Doctor is outside the organization");
    if(!(await client.query("SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL",[input.patientId])).rows[0])throw bad("LAB_PATIENT_NOT_FOUND","Patient not found");
    if(input.encounterId && !(await client.query(`SELECT 1 FROM encounters e JOIN branches b ON b.id=e.branch_id WHERE e.id=$1 AND e.patient_id=$2
      AND b.organization_id=$3`,[input.encounterId,input.patientId,input.organizationId])).rows[0])throw bad("LAB_ENCOUNTER_SCOPE_MISMATCH","Encounter is outside the case scope");
    for(const item of input.items){if(item.procedureId && !(await client.query(`SELECT 1 FROM procedures p JOIN encounters e ON e.id=p.encounter_id
        JOIN branches b ON b.id=e.branch_id WHERE p.id=$1 AND p.patient_id=$2 AND b.organization_id=$3`,[item.procedureId,input.patientId,input.organizationId])).rows[0])
        throw bad("LAB_PROCEDURE_SCOPE_MISMATCH","Procedure is outside the case scope");if(item.treatmentPlanItemId && !(await client.query(
        `SELECT 1 FROM treatment_plan_items i JOIN treatment_plans p ON p.id=i.treatment_plan_id JOIN services s ON s.id=i.service_id
         WHERE i.id=$1 AND p.patient_id=$2 AND s.organization_id=$3`,[item.treatmentPlanItemId,input.patientId,input.organizationId])).rows[0])
        throw bad("LAB_PLAN_ITEM_SCOPE_MISMATCH","Treatment plan item is outside the case scope");}}
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,entityType:string,id:string,after:unknown,organizationId:string,reason?:string){
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType,entityId:id,after,...(reason?{reason}:{}),requestId:auth.requestId});
    await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,aggregateId:id,eventType,payload:{entityId:id,organizationId},requestId:auth.requestId});}
}
function money<T extends Record<string,unknown>>(row:T){for(const key of ["costMinor","totalCostMinor","sizeBytes"])if(typeof row[key]==="string")
  (row as Record<string,unknown>)[key]=Number(row[key]);return row;}
function bad(code:string,message:string){return new ApiException(HttpStatus.BAD_REQUEST,code,message);}
function conflict(code:string,message:string){return new ApiException(HttpStatus.CONFLICT,code,message);}
function notFound(code:string,message:string){return new ApiException(HttpStatus.NOT_FOUND,code,message);}
