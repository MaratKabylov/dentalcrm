import type { AnalyticsRangeInput,CreateMarketingAttributionInput,CreateMarketingCampaignInput,
  RecordMarketingSpendInput } from "@dental/contracts";
import { HttpStatus,Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertBranchAccess,assertOrganizationAccess } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

type Row=Record<string,unknown>;

@Injectable()
export class AnalyticsService {
  constructor(private readonly database:DatabaseService,private readonly audit:AuditService,private readonly outbox:OutboxService){}

  treatmentAcceptance(auth:AuthContext,input:AnalyticsRangeInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertScope(client,auth,input);const values=this.range(input);
    const rows=(await client.query<Row>(`WITH first_presentations AS (
      SELECT treatment_plan_id,min(presented_at) AS presented_at FROM treatment_plan_presentations GROUP BY treatment_plan_id
    ),base AS (
      SELECT i.service_id,s.name AS service_name,i.final_price_minor,
        EXISTS(SELECT 1 FROM treatment_plan_acceptances a WHERE a.treatment_plan_item_id=i.id AND a.accepted_at<$3) AS accepted
      FROM treatment_plans p JOIN first_presentations fp ON fp.treatment_plan_id=p.id
      JOIN treatment_plan_items i ON i.treatment_plan_id=p.id JOIN services s ON s.id=i.service_id
      WHERE p.organization_id=$1 AND fp.presented_at>=$2 AND fp.presented_at<$3 AND p.currency=$4
        AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM opportunities o WHERE o.treatment_plan_id=p.id AND o.branch_id=$5))
    ) SELECT service_id AS "serviceId",service_name AS "serviceName",count(*)::int AS "presentedItems",
      count(*) FILTER(WHERE accepted)::int AS "acceptedItems",COALESCE(sum(final_price_minor),0)::text AS "presentedAmountMinor",
      COALESCE(sum(final_price_minor) FILTER(WHERE accepted),0)::text AS "acceptedAmountMinor"
      FROM base GROUP BY service_id,service_name ORDER BY service_name`,values)).rows.map(numbers);
    const summary=summarizeAcceptance(rows);return {range:rangeOutput(input),summary,byService:rows.map(acceptanceRates)};
  });}

  chairEconomics(auth:AuthContext,input:AnalyticsRangeInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertScope(client,auth,input);const rows=(await client.query<Row>(`WITH appointment_revenue AS (
      SELECT e.appointment_id,sum(c.total_amount_minor)::bigint AS revenue_minor FROM charges c
      JOIN encounters e ON e.id=c.encounter_id WHERE c.posted_at>=$2 AND c.posted_at<$3 AND c.currency=$4 GROUP BY e.appointment_id
    ) SELECT ch.id AS "chairId",ch.name AS "chairName",b.id AS "branchId",b.name AS "branchName",
      count(a.id) FILTER(WHERE a.status NOT IN ('cancelled','no_show','rescheduled'))::int AS "appointmentCount",
      count(a.id) FILTER(WHERE a.status='completed')::int AS "completedCount",count(a.id) FILTER(WHERE a.status='no_show')::int AS "noShowCount",
      COALESCE(sum(EXTRACT(epoch FROM (LEAST(a.ends_at,$3)-GREATEST(a.starts_at,$2)))/60)
        FILTER(WHERE a.status NOT IN ('cancelled','no_show','rescheduled')),0)::numeric(18,2)::text AS "bookedMinutes",
      COALESCE(sum(EXTRACT(epoch FROM (LEAST(a.ends_at,$3)-GREATEST(a.starts_at,$2)))/60)
        FILTER(WHERE a.status='completed'),0)::numeric(18,2)::text AS "completedMinutes",
      COALESCE(sum(r.revenue_minor),0)::text AS "revenueMinor"
      FROM chairs ch JOIN branches b ON b.id=ch.branch_id LEFT JOIN appointments a ON a.chair_id=ch.id AND a.starts_at<$3 AND a.ends_at>$2
      LEFT JOIN appointment_revenue r ON r.appointment_id=a.id WHERE b.organization_id=$1 AND ch.archived_at IS NULL
        AND ($5::uuid IS NULL OR b.id=$5) GROUP BY ch.id,ch.name,b.id,b.name ORDER BY b.name,ch.name`,this.range(input))).rows.map(numbers);
    return {range:rangeOutput(input),chairs:rows.map((row)=>({...row,
      completionRateBps:ratio(row.completedCount,row.appointmentCount),revenuePerCompletedHourMinor:perHour(row.revenueMinor,row.completedMinutes)}))};
  });}

  contributionMargin(auth:AuthContext,input:AnalyticsRangeInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertScope(client,auth,input);const rows:Row[]=(await client.query<Row>(`WITH revenue AS (
      SELECT ci.service_id,ci.procedure_id,sum(ci.total_amount_minor)::bigint AS revenue_minor FROM charge_items ci JOIN charges c ON c.id=ci.charge_id
      JOIN branches b ON b.id=c.branch_id WHERE b.organization_id=$1 AND c.posted_at>=$2 AND c.posted_at<$3 AND c.currency=$4
        AND ($5::uuid IS NULL OR c.branch_id=$5) GROUP BY ci.service_id,ci.procedure_id
    ),material AS (
      SELECT mc.procedure_id,COALESCE(sum(abs(sm.quantity_delta)*COALESCE(pb.purchase_price_minor,0)),0)::bigint AS cost
      FROM material_consumptions mc JOIN stock_movements sm ON sm.document_id=mc.document_id
      LEFT JOIN product_batches pb ON pb.id=sm.batch_id AND pb.currency=$4 WHERE mc.status='confirmed' AND sm.quantity_delta<0 GROUP BY mc.procedure_id
    ),laboratory AS (
      SELECT procedure_id,sum(cost_minor)::bigint AS cost FROM lab_case_items WHERE procedure_id IS NOT NULL AND currency=$4 GROUP BY procedure_id
    ),labor AS (
      SELECT a.source_id AS procedure_id,sum(a.amount_minor)::bigint AS cost FROM payroll_accruals a
      JOIN payroll_periods p ON p.id=a.payroll_period_id WHERE a.source_type='procedure' AND p.status='approved' AND a.currency=$4 GROUP BY a.source_id
    ) SELECT s.id AS "serviceId",s.name AS "serviceName",COALESCE(sum(r.revenue_minor),0)::text AS "revenueMinor",
      COALESCE(sum(m.cost),0)::text AS "materialCostMinor",COALESCE(sum(l.cost),0)::text AS "laboratoryCostMinor",
      COALESCE(sum(w.cost),0)::text AS "laborCostMinor" FROM revenue r JOIN services s ON s.id=r.service_id
      LEFT JOIN material m ON m.procedure_id=r.procedure_id LEFT JOIN laboratory l ON l.procedure_id=r.procedure_id
      LEFT JOIN labor w ON w.procedure_id=r.procedure_id GROUP BY s.id,s.name ORDER BY s.name`,this.range(input))).rows.map(numbers).map(margin);
    const summary=margin(rows.reduce<Row>((total,row)=>{for(const key of ["revenueMinor","materialCostMinor","laboratoryCostMinor","laborCostMinor"])
      total[key]=Number(total[key] ?? 0)+Number(row[key] ?? 0);return total;},{serviceId:null,serviceName:"All services"}));
    return {range:rangeOutput(input),summary,byService:rows};
  });}

  marketingAttribution(auth:AuthContext,input:AnalyticsRangeInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertScope(client,auth,input);const rows=(await client.query<Row>(`WITH lead_stats AS (
      SELECT source_id,count(*)::int leads,count(*) FILTER(WHERE status='converted')::int conversions
      FROM leads WHERE organization_id=$1 AND created_at>=$2 AND created_at<$3 AND ($5::uuid IS NULL OR branch_id=$5) GROUP BY source_id
    ),first_leads AS (
      SELECT DISTINCT ON (patient_id) patient_id,source_id FROM leads WHERE organization_id=$1 AND patient_id IS NOT NULL AND converted_at<$3
        AND ($5::uuid IS NULL OR branch_id=$5) ORDER BY patient_id,created_at,id
    ),revenue AS (
      SELECT f.source_id,sum(c.total_amount_minor)::bigint amount FROM first_leads f JOIN charges c ON c.patient_id=f.patient_id
      JOIN branches b ON b.id=c.branch_id WHERE c.posted_at>=$2 AND c.posted_at<$3 AND c.currency=$4 AND b.organization_id=$1
        AND ($5::uuid IS NULL OR c.branch_id=$5) GROUP BY f.source_id
    ) SELECT s.id AS "sourceId",COALESCE(s.name,'Unattributed') AS "sourceName",COALESCE(l.leads,0)::int AS "leadCount",
      COALESCE(l.conversions,0)::int AS "conversionCount",COALESCE(r.amount,0)::text AS "revenueMinor"
      FROM lead_sources s LEFT JOIN lead_stats l ON l.source_id=s.id LEFT JOIN revenue r ON r.source_id=s.id
      WHERE s.organization_id=$1 AND (COALESCE(l.leads,0)>0 OR COALESCE(r.amount,0)>0)
      UNION ALL SELECT NULL,'Unattributed',
        COALESCE((SELECT leads FROM lead_stats WHERE source_id IS NULL),0)::int,
        COALESCE((SELECT conversions FROM lead_stats WHERE source_id IS NULL),0)::int,
        COALESCE((SELECT amount FROM revenue WHERE source_id IS NULL),0)::text
      WHERE EXISTS(SELECT 1 FROM lead_stats WHERE source_id IS NULL) OR EXISTS(SELECT 1 FROM revenue WHERE source_id IS NULL)
      ORDER BY "revenueMinor" DESC`,this.range(input))).rows.map(numbers).map((row)=>({...row,conversionRateBps:ratio(row.conversionCount,row.leadCount)}));
    return {range:rangeOutput(input),bySource:rows};
  });}

  roas(auth:AuthContext,input:AnalyticsRangeInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertScope(client,auth,input);const rows=(await client.query<Row>(`WITH spend AS (
      SELECT campaign_id,sum(amount_minor)::bigint amount FROM marketing_spend_entries WHERE organization_id=$1 AND occurred_on>=$2::date
        AND occurred_on<$3::date AND currency=$4 AND ($5::uuid IS NULL OR branch_id=$5) GROUP BY campaign_id
    ),patients AS (
      SELECT campaign_id,patient_id,min(attributed_at) attributed_at FROM marketing_attributions WHERE organization_id=$1
        AND attribution_model='first_touch' AND attributed_at<$3 AND ($5::uuid IS NULL OR branch_id=$5) GROUP BY campaign_id,patient_id
    ),revenue AS (
      SELECT p.campaign_id,sum(c.total_amount_minor)::bigint amount FROM patients p JOIN charges c ON c.patient_id=p.patient_id
      JOIN branches b ON b.id=c.branch_id WHERE c.posted_at>=GREATEST($2,p.attributed_at) AND c.posted_at<$3 AND c.currency=$4
        AND b.organization_id=$1 AND ($5::uuid IS NULL OR c.branch_id=$5) GROUP BY p.campaign_id
    ) SELECT c.id AS "campaignId",c.code,c.name,COALESCE(s.amount,0)::text AS "spendMinor",COALESCE(r.amount,0)::text AS "revenueMinor",
      count(p.patient_id) FILTER(WHERE p.attributed_at>=$2)::int AS "attributedPatients" FROM marketing_campaigns c
      LEFT JOIN spend s ON s.campaign_id=c.id LEFT JOIN revenue r ON r.campaign_id=c.id LEFT JOIN patients p ON p.campaign_id=c.id
      WHERE c.organization_id=$1 AND c.currency=$4 AND c.starts_on<$3::date AND (c.ends_on IS NULL OR c.ends_on>=$2::date)
      GROUP BY c.id,c.code,c.name,s.amount,r.amount ORDER BY COALESCE(r.amount,0) DESC`,this.range(input))).rows.map(numbers).map((row)=>({...row,
        roasBps:ratio(row.revenueMinor,row.spendMinor),returnOnAdSpend:Number(row.spendMinor)>0?round(Number(row.revenueMinor)/Number(row.spendMinor)):null}));
    return {range:rangeOutput(input),campaigns:rows};
  });}

  inventory(auth:AuthContext,input:AnalyticsRangeInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertScope(client,auth,input);const rows=(await client.query<Row>(`WITH balance AS (
      SELECT sm.product_id,sum(sm.quantity_delta) quantity,sum(sm.quantity_delta*COALESCE(pb.purchase_price_minor,0)) value_minor
      FROM stock_movements sm JOIN warehouses w ON w.id=sm.warehouse_id LEFT JOIN product_batches pb ON pb.id=sm.batch_id AND pb.currency=$4
      WHERE sm.organization_id=$1 AND sm.occurred_at<$3 AND ($5::uuid IS NULL OR w.branch_id=$5) GROUP BY sm.product_id
    ),movement AS (
      SELECT sm.product_id,sum(-sm.quantity_delta) FILTER(WHERE sm.quantity_delta<0 AND d.document_type='consumption') consumed,
        sum((-sm.quantity_delta)*COALESCE(pb.purchase_price_minor,0)) FILTER(WHERE sm.quantity_delta<0 AND d.document_type='consumption') consumed_value,
        sum((-sm.quantity_delta)*COALESCE(pb.purchase_price_minor,0)) FILTER(WHERE sm.quantity_delta<0 AND d.document_type='writeoff') writeoff_value
      FROM stock_movements sm JOIN warehouses w ON w.id=sm.warehouse_id JOIN stock_documents d ON d.id=sm.document_id
      LEFT JOIN product_batches pb ON pb.id=sm.batch_id AND pb.currency=$4 WHERE sm.organization_id=$1 AND sm.occurred_at>=$2 AND sm.occurred_at<$3
        AND ($5::uuid IS NULL OR w.branch_id=$5) GROUP BY sm.product_id
    ) SELECT p.id AS "productId",p.sku,p.name,u.symbol AS unit,COALESCE(b.quantity,0)::numeric(18,6)::text AS "onHandQuantity",
      p.minimum_stock::numeric(18,6)::text AS "minimumStock",COALESCE(b.value_minor,0)::bigint::text AS "stockValueMinor",
      COALESCE(m.consumed,0)::numeric(18,6)::text AS "consumedQuantity",COALESCE(m.consumed_value,0)::bigint::text AS "consumptionCostMinor",
      COALESCE(m.writeoff_value,0)::bigint::text AS "writeoffCostMinor" FROM products p JOIN units_of_measure u ON u.id=p.unit_id
      LEFT JOIN balance b ON b.product_id=p.id LEFT JOIN movement m ON m.product_id=p.id WHERE p.organization_id=$1 AND p.active
      ORDER BY p.name`,this.range(input))).rows.map(numbers);const days=daysInclusive(input.from,input.to);
    return {range:rangeOutput(input),products:rows.map((row)=>{const daily=Number(row.consumedQuantity)/days;return {...row,
      daysOfStock:daily>0?round(Number(row.onHandQuantity)/daily):null,belowMinimum:Number(row.onHandQuantity)<=Number(row.minimumStock)};})};
  });}

  createCampaign(auth:AuthContext,input:CreateMarketingCampaignInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);await this.assertCatalog(client,input.organizationId,input.sourceId,input.channelId);
    const row=(await client.query<Row & {id:string}>(`INSERT INTO marketing_campaigns(tenant_id,organization_id,source_id,channel_id,code,name,currency,
      starts_on,ends_on,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id,organization_id AS "organizationId",
      source_id AS "sourceId",channel_id AS "channelId",code,name,currency,starts_on AS "startsOn",ends_on AS "endsOn",active`,
      [auth.tenantId,input.organizationId,input.sourceId ?? null,input.channelId ?? null,input.code,input.name,input.currency,input.startsOn,input.endsOn ?? null,auth.userId])).rows[0]!;
    await this.record(client,auth,"marketing_campaign.created","MarketingCampaignCreated","marketing_campaign",row.id,row,input.organizationId);return row;
  });}

  recordSpend(auth:AuthContext,id:string,input:RecordMarketingSpendInput){return this.database.withTenant(auth,async(client)=>{
    const campaign=await this.campaign(client,auth,id);if(input.branchId){const organizationId=await assertBranchAccess(client,auth,input.branchId);
      if(organizationId!==campaign.organizationId)throw bad("MARKETING_BRANCH_MISMATCH","Branch is outside the campaign organization");}
    const previous=(await client.query<Row>(`SELECT id,campaign_id AS "campaignId",branch_id AS "branchId",occurred_on AS "occurredOn",
      amount_minor::text AS "amountMinor",currency,reference FROM marketing_spend_entries WHERE organization_id=$1 AND idempotency_key=$2`,
      [campaign.organizationId,input.idempotencyKey])).rows[0];if(previous)return numbers(previous);
    const row=numbers((await client.query<Row & {id:string}>(`INSERT INTO marketing_spend_entries(tenant_id,organization_id,campaign_id,branch_id,
      occurred_on,amount_minor,currency,reference,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id,campaign_id AS "campaignId",branch_id AS "branchId",occurred_on AS "occurredOn",amount_minor::text AS "amountMinor",currency,reference`,
      [auth.tenantId,campaign.organizationId,id,input.branchId ?? null,input.occurredOn,input.amountMinor,campaign.currency,input.reference ?? null,
        input.idempotencyKey,auth.userId])).rows[0]!);
    await this.record(client,auth,"marketing_spend.recorded","MarketingSpendRecorded","marketing_spend",String(row.id),row,campaign.organizationId);return row;
  });}

  createAttribution(auth:AuthContext,input:CreateMarketingAttributionInput){return this.database.withTenant(auth,async(client)=>{
    const campaign=await this.campaign(client,auth,input.campaignId);if(input.branchId){const organizationId=await assertBranchAccess(client,auth,input.branchId);
      if(organizationId!==campaign.organizationId)throw bad("MARKETING_BRANCH_MISMATCH","Branch is outside the campaign organization");}
    if(!(await client.query("SELECT 1 FROM patients WHERE id=$1",[input.patientId])).rows[0])throw bad("MARKETING_PATIENT_NOT_FOUND","Patient not found");
    if(input.leadId && !(await client.query(`SELECT 1 FROM leads WHERE id=$1 AND organization_id=$2 AND (patient_id IS NULL OR patient_id=$3)`,
      [input.leadId,campaign.organizationId,input.patientId])).rows[0])throw bad("MARKETING_LEAD_MISMATCH","Lead is outside the campaign or belongs to another patient");
    if((await client.query("SELECT 1 FROM marketing_attributions WHERE organization_id=$1 AND patient_id=$2 AND attribution_model=$3",
      [campaign.organizationId,input.patientId,input.model])).rows[0])throw conflict("MARKETING_ATTRIBUTION_EXISTS","Patient already has this attribution model");
    const row=(await client.query<Row & {id:string}>(`INSERT INTO marketing_attributions(tenant_id,organization_id,campaign_id,lead_id,patient_id,
      branch_id,attribution_model,attributed_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,campaign_id AS "campaignId",
      lead_id AS "leadId",patient_id AS "patientId",branch_id AS "branchId",attribution_model AS model,attributed_at AS "attributedAt"`,
      [auth.tenantId,campaign.organizationId,input.campaignId,input.leadId ?? null,input.patientId,input.branchId ?? null,input.model,
        input.attributedAt ?? new Date().toISOString(),auth.userId])).rows[0]!;
    await this.record(client,auth,"marketing_attribution.created","MarketingAttributionCreated","marketing_attribution",row.id,row,campaign.organizationId);return row;
  });}

  private range(input:AnalyticsRangeInput){return [input.organizationId,new Date(`${input.from}T00:00:00.000Z`),
    new Date(new Date(`${input.to}T00:00:00.000Z`).getTime()+86_400_000),input.currency,input.branchId ?? null];}
  private async assertScope(client:PoolClient,auth:AuthContext,input:AnalyticsRangeInput){if(input.branchId){const organizationId=await assertBranchAccess(client,auth,input.branchId);
    if(organizationId!==input.organizationId)throw bad("ANALYTICS_SCOPE_MISMATCH","Branch is outside the requested organization");}
    else await assertOrganizationAccess(client,auth,input.organizationId,false);}
  private async campaign(client:PoolClient,auth:AuthContext,id:string){const row=(await client.query<{organizationId:string;currency:string}>(
    `SELECT organization_id AS "organizationId",currency FROM marketing_campaigns WHERE id=$1 AND active`,[id])).rows[0];
    if(!row)throw new ApiException(HttpStatus.NOT_FOUND,"MARKETING_CAMPAIGN_NOT_FOUND","Active campaign not found");
    await assertOrganizationAccess(client,auth,row.organizationId,false);return row;}
  private async assertCatalog(client:PoolClient,organizationId:string,sourceId?:string,channelId?:string){const row=(await client.query<{source:boolean;channel:boolean}>(
    `SELECT ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM lead_sources WHERE id=$2 AND organization_id=$1 AND active)) source,
      ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM lead_channels WHERE id=$3 AND organization_id=$1 AND active)) channel`,
    [organizationId,sourceId ?? null,channelId ?? null])).rows[0]!;if(!row.source || !row.channel)throw bad("MARKETING_CATALOG_MISMATCH","Source or channel is outside the organization");}
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,entityType:string,id:string,after:unknown,organizationId:string){
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType,entityId:id,after,requestId:auth.requestId});
    await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,aggregateId:id,eventType,payload:{id,organizationId},requestId:auth.requestId});}
}

function numbers<T extends Row>(row:T):T{const mutable=row as Row;for(const [key,value] of Object.entries(row))if(typeof value==="string" &&
  (/Minor$/.test(key)||["bookedMinutes","completedMinutes","onHandQuantity","minimumStock","consumedQuantity"].includes(key)))mutable[key]=Number(value);return row;}
function ratio(numerator:unknown,denominator:unknown){const divisor=Number(denominator);return divisor>0?Math.round(Number(numerator)*10_000/divisor):null;}
function perHour(amount:unknown,minutes:unknown){const duration=Number(minutes);return duration>0?Math.round(Number(amount)*60/duration):null;}
function round(value:number){return Math.round((value+Number.EPSILON)*100)/100;}
function acceptanceRates(row:Row){return {...row,itemAcceptanceRateBps:ratio(row.acceptedItems,row.presentedItems),
  amountAcceptanceRateBps:ratio(row.acceptedAmountMinor,row.presentedAmountMinor)};}
function summarizeAcceptance(rows:Row[]){const summary=rows.reduce<Row>((total,row)=>{for(const key of ["presentedItems","acceptedItems","presentedAmountMinor","acceptedAmountMinor"])
  total[key]=Number(total[key] ?? 0)+Number(row[key] ?? 0);return total;},{});return acceptanceRates(summary);}
function margin(row:Row){const costs=Number(row.materialCostMinor)+Number(row.laboratoryCostMinor)+Number(row.laborCostMinor);
  const contribution=Number(row.revenueMinor)-costs;return {...row,variableCostMinor:costs,contributionMarginMinor:contribution,
    contributionMarginBps:ratio(contribution,row.revenueMinor)};}
function rangeOutput(input:AnalyticsRangeInput){return {organizationId:input.organizationId,branchId:input.branchId ?? null,from:input.from,to:input.to,currency:input.currency};}
function daysInclusive(from:string,to:string){return Math.floor((Date.parse(`${to}T00:00:00.000Z`)-Date.parse(`${from}T00:00:00.000Z`))/86_400_000)+1;}
function bad(code:string,message:string){return new ApiException(HttpStatus.BAD_REQUEST,code,message);}
function conflict(code:string,message:string){return new ApiException(HttpStatus.CONFLICT,code,message);}
