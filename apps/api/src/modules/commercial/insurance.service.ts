import type { AdjudicateInsuranceClaimInput,CreateInsuranceClaimInput,CreateInsuranceCompanyInput,CreateInsurancePlanInput,
  CreateInsurancePriceListInput,CreatePatientPolicyInput,RecordInsurancePaymentInput } from "@dental/contracts";
import { HttpStatus,Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertBranchAccess,assertOrganizationAccess,organizationScopeSql,scopeValues } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

interface ClaimRow {id:string;organizationId:string;patientId:string;branchId:string;currency:string;status:string;billedAmountMinor:string|number;
  approvedAmountMinor:string|number|null}

@Injectable()
export class InsuranceService {
  constructor(private readonly database:DatabaseService,private readonly audit:AuditService,private readonly outbox:OutboxService){}

  createCompany(auth:AuthContext,input:CreateInsuranceCompanyInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);const row=(await client.query<{id:string}&Record<string,unknown>>(`INSERT INTO insurance_companies
      (tenant_id,organization_id,code,name,contact,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6)
      RETURNING id,organization_id AS "organizationId",code,name,contact,active`,[auth.tenantId,input.organizationId,input.code,input.name,
      input.contact ?? null,auth.userId])).rows[0]!;await this.record(client,auth,"insurance_company.created","InsuranceCompanyCreated",
      "insurance_company",row.id,row,input.organizationId);return row;});}

  createPlan(auth:AuthContext,input:CreateInsurancePlanInput){return this.database.withTenant(auth,async(client)=>{const company=(await client.query<{organizationId:string}>(
    `SELECT organization_id AS "organizationId" FROM insurance_companies WHERE id=$1 AND active`,[input.companyId])).rows[0];
    if(!company)throw notFound("INSURANCE_COMPANY_NOT_FOUND","Insurance company not found");await assertOrganizationAccess(client,auth,company.organizationId,false);
    const row=(await client.query<{id:string}&Record<string,unknown>>(`INSERT INTO insurance_plans(tenant_id,organization_id,company_id,code,name,currency,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,organization_id AS "organizationId",company_id AS "companyId",code,name,currency,active`,
      [auth.tenantId,company.organizationId,input.companyId,input.code,input.name,input.currency,auth.userId])).rows[0]!;await this.record(client,auth,
      "insurance_plan.created","InsurancePlanCreated","insurance_plan",row.id,row,company.organizationId);return row;});}

  createPriceList(auth:AuthContext,input:CreateInsurancePriceListInput){return this.database.withTenant(auth,async(client)=>{const plan=(await client.query<{
    organizationId:string;currency:string}>(`SELECT organization_id AS "organizationId",currency FROM insurance_plans WHERE id=$1 AND active`,[input.planId])).rows[0];
    if(!plan)throw notFound("INSURANCE_PLAN_NOT_FOUND","Insurance plan not found");await assertOrganizationAccess(client,auth,plan.organizationId,false);
    const serviceIds=[...new Set(input.items.map((item)=>item.serviceId))];const count=(await client.query<{count:number}>(`SELECT count(*)::int AS count FROM services
      WHERE id=ANY($1::uuid[]) AND organization_id=$2 AND active`,[serviceIds,plan.organizationId])).rows[0]!.count;
    if(count!==serviceIds.length)throw bad("INSURANCE_SERVICE_SCOPE_MISMATCH","One or more services are outside the organization");
    const list=(await client.query<{id:string}>(`INSERT INTO insurance_price_lists(tenant_id,organization_id,plan_id,name,currency,valid_from,valid_to,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[auth.tenantId,plan.organizationId,input.planId,input.name,plan.currency,input.validFrom,
      input.validTo ?? null,auth.userId])).rows[0]!;for(const item of input.items)await client.query(`INSERT INTO insurance_price_list_items
      (tenant_id,organization_id,price_list_id,service_id,price_minor) VALUES($1,$2,$3,$4,$5)`,[auth.tenantId,plan.organizationId,list.id,
      item.serviceId,item.priceMinor]);const result={id:list.id,organizationId:plan.organizationId,planId:input.planId,name:input.name,currency:plan.currency,
      validFrom:input.validFrom,validTo:input.validTo ?? null,items:input.items};await this.record(client,auth,"insurance_price_list.created",
      "InsurancePriceListCreated","insurance_price_list",list.id,result,plan.organizationId);return result;});}

  createPolicy(auth:AuthContext,input:CreatePatientPolicyInput){return this.database.withTenant(auth,async(client)=>{const plan=(await client.query<{
    organizationId:string}>(`SELECT organization_id AS "organizationId" FROM insurance_plans WHERE id=$1 AND active`,[input.planId])).rows[0];
    if(!plan)throw notFound("INSURANCE_PLAN_NOT_FOUND","Insurance plan not found");await assertOrganizationAccess(client,auth,plan.organizationId,false);
    if(!(await client.query("SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL",[input.patientId])).rows[0])throw bad("PATIENT_NOT_FOUND","Patient not found");
    const row=(await client.query<{id:string}&Record<string,unknown>>(`INSERT INTO patient_policies(tenant_id,organization_id,plan_id,patient_id,
      policy_number,valid_from,valid_to,coverage_percent,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id,organization_id AS "organizationId",plan_id AS "planId",patient_id AS "patientId",policy_number AS "policyNumber",
      valid_from AS "validFrom",valid_to AS "validTo",coverage_percent::text AS "coveragePercent",status`,[auth.tenantId,plan.organizationId,
      input.planId,input.patientId,input.policyNumber,input.validFrom,input.validTo ?? null,input.coveragePercent,auth.userId])).rows[0]!;
    row.coveragePercent=Number(row.coveragePercent);await this.record(client,auth,"patient_policy.created","PatientPolicyCreated","patient_policy",row.id,row,
      plan.organizationId);return row;});}

  createClaim(auth:AuthContext,input:CreateInsuranceClaimInput){return this.database.withTenant(auth,async(client)=>{const policy=(await client.query<{
    organizationId:string;patientId:string;currency:string;coveragePercent:number}>(`SELECT p.organization_id AS "organizationId",p.patient_id AS "patientId",
      x.currency,p.coverage_percent::float8 AS "coveragePercent" FROM patient_policies p JOIN insurance_plans x ON x.id=p.plan_id
      WHERE p.id=$1 AND p.status='active' AND p.valid_from<=$2::date AND COALESCE(p.valid_to,'infinity'::date)>=$2::date`,[input.policyId,input.serviceDate])).rows[0];
    if(!policy)throw conflict("INSURANCE_POLICY_INACTIVE","Insurance policy is not active for the service date");const branchOrg=await assertBranchAccess(client,auth,input.branchId);
    if(branchOrg!==policy.organizationId)throw bad("INSURANCE_BRANCH_SCOPE_MISMATCH","Branch and policy belong to different organizations");
    const prepared=[];for(const item of input.items){const procedure=(await client.query<{serviceId:string;patientId:string;status:string}>(`SELECT p.service_id AS "serviceId",
        p.patient_id AS "patientId",p.status FROM procedures p JOIN encounters e ON e.id=p.encounter_id JOIN branches b ON b.id=e.branch_id
        WHERE p.id=$1 AND b.organization_id=$2`,[item.procedureId,policy.organizationId])).rows[0];
      if(!procedure || procedure.patientId!==policy.patientId || procedure.status!=="completed")throw bad("INSURANCE_PROCEDURE_INVALID",
        "Claim procedures must be completed for the insured patient and organization");const contracted=(await client.query<{priceMinor:string}>(`SELECT i.price_minor::text AS "priceMinor"
        FROM insurance_price_lists l JOIN insurance_price_list_items i ON i.price_list_id=l.id WHERE l.plan_id=(SELECT plan_id FROM patient_policies WHERE id=$1)
        AND i.service_id=$2 AND l.active AND l.valid_from<=$3::date AND COALESCE(l.valid_to,'infinity'::date)>=$3::date ORDER BY l.valid_from DESC LIMIT 1`,
        [input.policyId,procedure.serviceId,input.serviceDate])).rows[0];if(!contracted)throw bad("INSURANCE_PRICE_NOT_FOUND","No insurance price exists for a claimed service");
      const maximum=Math.round(Number(contracted.priceMinor)*policy.coveragePercent/100);if(item.billedAmountMinor>maximum)throw bad("INSURANCE_BILLED_AMOUNT_EXCEEDED",
        "Billed amount exceeds the contracted covered amount");prepared.push({...item,serviceId:procedure.serviceId});}
    const total=prepared.reduce((sum,item)=>sum+item.billedAmountMinor,0);const claim=(await client.query<{id:string}>(`INSERT INTO insurance_claims
      (tenant_id,organization_id,policy_id,patient_id,branch_id,service_date,currency,billed_amount_minor,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,[auth.tenantId,policy.organizationId,input.policyId,policy.patientId,input.branchId,
      input.serviceDate,policy.currency,total,auth.userId])).rows[0]!;const items=[];for(const item of prepared){const row=(await client.query(`INSERT INTO insurance_claim_items
      (tenant_id,organization_id,claim_id,procedure_id,service_id,billed_amount_minor) VALUES($1,$2,$3,$4,$5,$6)
      RETURNING id,procedure_id AS "procedureId",service_id AS "serviceId",billed_amount_minor::text AS "billedAmountMinor"`,
      [auth.tenantId,policy.organizationId,claim.id,item.procedureId,item.serviceId,item.billedAmountMinor])).rows[0]!;items.push(money(row));}
    await client.query(`INSERT INTO insurance_claim_events(tenant_id,organization_id,claim_id,to_status,actor_user_id)
      VALUES($1,$2,$3,'draft',$4)`,[auth.tenantId,policy.organizationId,claim.id,auth.userId]);const result={id:claim.id,organizationId:policy.organizationId,
      patientId:policy.patientId,status:"draft",currency:policy.currency,billedAmountMinor:total,items};await this.record(client,auth,"insurance_claim.created",
      "InsuranceClaimCreated","insurance_claim",claim.id,result,policy.organizationId);return result;});}

  submitClaim(auth:AuthContext,id:string){return this.database.withTenant(auth,async(client)=>{const claim=await this.find(client,auth,id,true);
    if(claim.status!=="draft")throw conflict("INSURANCE_CLAIM_NOT_DRAFT","Only a draft claim can be submitted");const row=(await client.query(
      `UPDATE insurance_claims SET status='submitted',submitted_at=now(),updated_at=now(),updated_by=$2 WHERE id=$1 RETURNING id,status,submitted_at AS "submittedAt"`,
      [id,auth.userId])).rows[0]!;await this.event(client,auth,claim,"submitted");await this.record(client,auth,"insurance_claim.submitted",
      "InsuranceClaimSubmitted","insurance_claim",id,row,claim.organizationId);return row;});}

  adjudicate(auth:AuthContext,id:string,input:AdjudicateInsuranceClaimInput){return this.database.withTenant(auth,async(client)=>{const claim=await this.find(client,auth,id,true);
    if(claim.status!=="submitted")throw conflict("INSURANCE_CLAIM_NOT_SUBMITTED","Only a submitted claim can be adjudicated");const rows=(await client.query<{
      id:string;billedAmountMinor:string}>(`SELECT id,billed_amount_minor::text AS "billedAmountMinor" FROM insurance_claim_items WHERE claim_id=$1 ORDER BY id`,[id])).rows;
    const byId=new Map(input.items.map((item)=>[item.claimItemId,item]));if(rows.length!==byId.size || rows.some((row)=>!byId.has(row.id)))
      throw bad("INSURANCE_ADJUDICATION_INCOMPLETE","Every claim item must be adjudicated exactly once");let approved=0;
    for(const row of rows){const decision=byId.get(row.id)!;if(decision.approvedAmountMinor>Number(row.billedAmountMinor))throw bad("INSURANCE_APPROVAL_EXCEEDED",
      "Approved amount cannot exceed billed amount");approved+=decision.approvedAmountMinor;await client.query(`UPDATE insurance_claim_items SET approved_amount_minor=$2,
      adjudication_reason=$3 WHERE id=$1`,[row.id,decision.approvedAmountMinor,decision.reason ?? null]);}
    const billed=Number(claim.billedAmountMinor),status=approved===0?"rejected":approved===billed?"approved":"partially_approved";
    const result=(await client.query(`UPDATE insurance_claims SET status=$2,approved_amount_minor=$3,adjudicated_at=now(),updated_at=now(),updated_by=$4
      WHERE id=$1 RETURNING id,status,billed_amount_minor::text AS "billedAmountMinor",approved_amount_minor::text AS "approvedAmountMinor",
      adjudicated_at AS "adjudicatedAt"`,[id,status,approved,auth.userId])).rows[0]!;await this.event(client,auth,claim,status,{approvedAmountMinor:approved});
    await this.record(client,auth,"insurance_claim.adjudicated","InsuranceClaimAdjudicated","insurance_claim",id,result,claim.organizationId);return money(result);});}

  recordPayment(auth:AuthContext,id:string,input:RecordInsurancePaymentInput){return this.database.withTenant(auth,async(client)=>{const claim=await this.find(client,auth,id,true);
    const previous=(await client.query(`SELECT id,amount_minor::text AS "amountMinor",currency,reference,paid_at AS "paidAt" FROM insurance_payments
      WHERE organization_id=$1 AND idempotency_key=$2`,[claim.organizationId,input.idempotencyKey])).rows[0];if(previous)return money(previous);
    if(!["approved","partially_approved"].includes(claim.status))throw conflict("INSURANCE_CLAIM_NOT_PAYABLE","Claim is not payable");
    const alreadyPaid=Number((await client.query<{total:string}>("SELECT COALESCE(sum(amount_minor),0)::text AS total FROM insurance_payments WHERE claim_id=$1",[id])).rows[0]!.total);
    if(alreadyPaid+input.amountMinor>Number(claim.approvedAmountMinor))throw conflict("INSURANCE_PAYMENT_EXCEEDED","Payment exceeds the remaining approved amount");
    const sourceAccount=await this.account(client,auth,`insurance-clearing:${claim.organizationId}`,"Insurance clearing","asset","insurance_clearing",
      claim.currency,null,null),receivableAccount=await this.account(client,auth,`patient-receivable:${claim.patientId}`,"Patient receivable","asset",
      "patient_receivable",claim.currency,claim.branchId,claim.patientId);const transaction=(await client.query<{id:string}>(`INSERT INTO ledger_transactions
      (tenant_id,transaction_type,currency,description,idempotency_key,posted_by) VALUES($1,'payment',$2,$3,$4,$5) RETURNING id`,
      [auth.tenantId,claim.currency,`Insurance claim ${id} payment`,`insurance:${input.idempotencyKey}`,auth.userId])).rows[0]!;
    const payment=(await client.query(`INSERT INTO insurance_payments(tenant_id,organization_id,claim_id,amount_minor,currency,reference,idempotency_key,
      paid_at,recorded_by,ledger_transaction_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,amount_minor::text AS "amountMinor",currency,
      reference,paid_at AS "paidAt",ledger_transaction_id AS "ledgerTransactionId"`,
      [auth.tenantId,claim.organizationId,id,input.amountMinor,claim.currency,input.reference,input.idempotencyKey,input.paidAt ?? new Date(),auth.userId,
        transaction.id])).rows[0]!;
    await client.query(`INSERT INTO ledger_entries(tenant_id,transaction_id,account_id,patient_id,amount_minor,memo) VALUES
      ($1,$2,$3,$4,$5,'Insurance settlement received'),($1,$2,$6,$4,$7,'Insurance receivable settled')`,
      [auth.tenantId,transaction.id,sourceAccount,claim.patientId,input.amountMinor,receivableAccount,-input.amountMinor]);
    const paid=Number((await client.query<{total:string}>("SELECT COALESCE(sum(amount_minor),0)::text AS total FROM insurance_payments WHERE claim_id=$1",[id])).rows[0]!.total);
    if(paid===Number(claim.approvedAmountMinor)){await client.query("UPDATE insurance_claims SET status='paid',paid_at=now(),updated_at=now(),updated_by=$2 WHERE id=$1",
      [id,auth.userId]);await this.event(client,auth,claim,"paid",{paidAmountMinor:paid});}
    await this.record(client,auth,"insurance_payment.recorded","InsurancePaymentRecorded","insurance_payment",String(payment.id),
      {claimId:id,amountMinor:input.amountMinor,paidAmountMinor:paid},claim.organizationId);return {...money(payment),claimStatus:paid===Number(claim.approvedAmountMinor)?"paid":claim.status};});}

  listClaims(auth:AuthContext,status?:string){const scope=auth.tenantWide?{sql:"TRUE",values:[] as unknown[]}:
    {sql:organizationScopeSql("c",1,2),values:scopeValues(auth)};const n=scope.values.length;return this.database.withTenant(auth,async(client)=>(await client.query(
      `SELECT c.id,c.organization_id AS "organizationId",c.patient_id AS "patientId",c.status,c.service_date AS "serviceDate",c.currency,
       c.billed_amount_minor::text AS "billedAmountMinor",c.approved_amount_minor::text AS "approvedAmountMinor",
       concat_ws(' ',p.last_name,p.first_name) AS "patientName" FROM insurance_claims c JOIN patients p ON p.id=c.patient_id
       WHERE ${scope.sql} AND ($${n+1}::text IS NULL OR c.status=$${n+1}) ORDER BY c.created_at DESC`,[...scope.values,status ?? null])).rows.map(money));}

  getClaim(auth:AuthContext,id:string){return this.database.withTenant(auth,async(client)=>{const claim=await this.find(client,auth,id);
    const items=(await client.query(`SELECT id,procedure_id AS "procedureId",service_id AS "serviceId",billed_amount_minor::text AS "billedAmountMinor",
      approved_amount_minor::text AS "approvedAmountMinor",adjudication_reason AS "reason" FROM insurance_claim_items WHERE claim_id=$1 ORDER BY created_at,id`,[id])).rows.map(money);
    const payments=(await client.query(`SELECT id,amount_minor::text AS "amountMinor",currency,reference,paid_at AS "paidAt" FROM insurance_payments
      WHERE claim_id=$1 ORDER BY paid_at,id`,[id])).rows.map(money);return {...money(claim as unknown as Record<string,unknown>),items,payments};});}

  private async find(client:PoolClient,auth:AuthContext,id:string,lock=false){const row=(await client.query<ClaimRow>(`SELECT id,organization_id AS "organizationId",
    patient_id AS "patientId",branch_id AS "branchId",currency,status,billed_amount_minor::text AS "billedAmountMinor",
    approved_amount_minor::text AS "approvedAmountMinor" FROM insurance_claims WHERE id=$1${lock?" FOR UPDATE":""}`,[id])).rows[0];
    if(!row)throw notFound("INSURANCE_CLAIM_NOT_FOUND","Insurance claim not found");await assertOrganizationAccess(client,auth,row.organizationId,false);return row;}
  private event(client:PoolClient,auth:AuthContext,claim:ClaimRow,to:string,details?:unknown){return client.query(`INSERT INTO insurance_claim_events
    (tenant_id,organization_id,claim_id,from_status,to_status,details,actor_user_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [auth.tenantId,claim.organizationId,claim.id,claim.status,to,details===undefined?null:JSON.stringify(details),auth.userId]);}
  private async account(client:PoolClient,auth:AuthContext,code:string,name:string,type:string,subtype:string,currency:string,branchId:string|null,
    patientId:string|null){const inserted=(await client.query<{id:string}>(`INSERT INTO financial_accounts
      (tenant_id,branch_id,patient_id,code,name,account_type,account_subtype,currency,is_system,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9) ON CONFLICT(tenant_id,code,currency) DO NOTHING RETURNING id`,
      [auth.tenantId,branchId,patientId,code,name,type,subtype,currency,auth.userId])).rows[0];if(inserted)return inserted.id;
    return (await client.query<{id:string}>("SELECT id FROM financial_accounts WHERE code=$1 AND currency=$2",[code,currency])).rows[0]!.id;}
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,entityType:string,id:string,after:unknown,organizationId:string){
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType,entityId:id,after,requestId:auth.requestId});
    await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,aggregateId:id,eventType,payload:{entityId:id,organizationId},requestId:auth.requestId});}
}
function money<T extends Record<string,unknown>>(row:T){for(const key of ["billedAmountMinor","approvedAmountMinor","amountMinor"])if(typeof row[key]==="string")
  (row as Record<string,unknown>)[key]=Number(row[key]);return row;}
function bad(code:string,message:string){return new ApiException(HttpStatus.BAD_REQUEST,code,message);}
function conflict(code:string,message:string){return new ApiException(HttpStatus.CONFLICT,code,message);}
function notFound(code:string,message:string){return new ApiException(HttpStatus.NOT_FOUND,code,message);}
