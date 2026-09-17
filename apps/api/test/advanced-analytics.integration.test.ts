import { randomUUID } from "node:crypto";
import pg,{type PoolClient} from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { DatabaseService } from "../src/database/database.service.js";
import { AnalyticsService } from "../src/modules/analytics/analytics.service.js";
import { AuditService } from "../src/modules/audit/audit.service.js";
import type { AuthContext } from "../src/modules/identity/auth-context.js";
import { OutboxService } from "../src/modules/outbox/outbox.service.js";

const databaseUrl=process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("phase 11 advanced analytics",()=>{
  const client=new pg.Client({connectionString:databaseUrl});
  const tenantId=randomUUID(),userId=randomUUID(),organizationId=randomUUID(),branchId=randomUUID(),employeeId=randomUUID(),doctorId=randomUUID();
  const patientId=randomUUID(),serviceId=randomUUID(),appointmentId=randomUUID(),encounterId=randomUUID(),procedureId=randomUUID(),chairId=randomUUID();
  let analytics:AnalyticsService,auth:AuthContext,campaignId:string;
  const range={organizationId,from:"2026-09-01",to:"2026-09-30",currency:"KZT" as const};

  beforeAll(async()=>{await client.connect();await client.query("BEGIN");
    await client.query("INSERT INTO tenants(id,slug,name) VALUES($1,$2,'Analytics tenant')",[tenantId,`analytics-${tenantId}`]);
    await client.query("INSERT INTO users(id,external_subject,display_name) VALUES($1,$2,'Analytics owner')",[userId,`analytics-${userId}`]);
    await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    await client.query("INSERT INTO organizations(id,tenant_id,code,name) VALUES($1,$2,'main','Main')",[organizationId,tenantId]);
    await client.query("INSERT INTO branches(id,tenant_id,organization_id,code,name) VALUES($1,$2,$3,'main','Main')",[branchId,tenantId,organizationId]);
    await client.query("INSERT INTO chairs(id,tenant_id,branch_id,code,name) VALUES($1,$2,$3,'chair-1','Chair 1')",[chairId,tenantId,branchId]);
    await client.query("INSERT INTO employees(id,tenant_id,user_id,first_name,last_name) VALUES($1,$2,$3,'Ada','Doctor')",[employeeId,tenantId,userId]);
    await client.query("INSERT INTO employee_branches(tenant_id,employee_id,branch_id) VALUES($1,$2,$3)",[tenantId,employeeId,branchId]);
    await client.query("INSERT INTO doctors(id,tenant_id,employee_id) VALUES($1,$2,$3)",[doctorId,tenantId,employeeId]);
    await client.query("INSERT INTO patients(id,tenant_id,first_name,last_name,phone,phone_normalized) VALUES($1,$2,'Pat','One','1','1')",[patientId,tenantId]);
    await client.query("INSERT INTO services(id,tenant_id,organization_id,code,name,duration_minutes) VALUES($1,$2,$3,'implant','Implant',60)",
      [serviceId,tenantId,organizationId]);
    await client.query(`INSERT INTO appointments(id,tenant_id,patient_id,doctor_id,branch_id,chair_id,starts_at,ends_at,status)
      VALUES($1,$2,$3,$4,$5,$6,'2026-09-10T09:00:00Z','2026-09-10T10:00:00Z','completed')`,
      [appointmentId,tenantId,patientId,doctorId,branchId,chairId]);
    await client.query(`INSERT INTO encounters(id,tenant_id,appointment_id,patient_id,doctor_id,branch_id,status,started_at,completed_at)
      VALUES($1,$2,$3,$4,$5,$6,'completed','2026-09-10T09:00:00Z','2026-09-10T10:00:00Z')`,
      [encounterId,tenantId,appointmentId,patientId,doctorId,branchId]);
    await client.query(`INSERT INTO procedures(id,tenant_id,encounter_id,patient_id,doctor_id,service_id,status,completed_at)
      VALUES($1,$2,$3,$4,$5,$6,'completed','2026-09-10T10:00:00Z')`,[procedureId,tenantId,encounterId,patientId,doctorId,serviceId]);
    const transactionId=randomUUID(),chargeId=randomUUID();
    await client.query("INSERT INTO ledger_transactions(id,tenant_id,transaction_type,currency,posted_at,posted_by) VALUES($1,$2,'charge','KZT','2026-09-10T10:00:00Z',$3)",
      [transactionId,tenantId,userId]);
    await client.query(`INSERT INTO charges(id,tenant_id,patient_id,branch_id,encounter_id,ledger_transaction_id,currency,total_amount_minor,posted_at,posted_by)
      VALUES($1,$2,$3,$4,$5,$6,'KZT',10000,'2026-09-10T10:00:00Z',$7)`,[chargeId,tenantId,patientId,branchId,encounterId,transactionId,userId]);
    await client.query(`INSERT INTO charge_items(tenant_id,charge_id,service_id,procedure_id,description,quantity,unit_price_minor,total_amount_minor)
      VALUES($1,$2,$3,$4,'Implant',1,10000,10000)`,[tenantId,chargeId,serviceId,procedureId]);

    const planId=randomUUID(),itemId=randomUUID();
    await client.query("INSERT INTO treatment_plans(id,tenant_id,organization_id,patient_id,title,status,currency) VALUES($1,$2,$3,$4,'Plan','accepted','KZT')",
      [planId,tenantId,organizationId,patientId]);
    await client.query(`INSERT INTO treatment_plan_items(id,tenant_id,organization_id,treatment_plan_id,service_id,doctor_id,quantity,
      list_price_minor,final_price_minor,status,position) VALUES($1,$2,$3,$4,$5,$6,1,10000,10000,'accepted',1)`,
      [itemId,tenantId,organizationId,planId,serviceId,doctorId]);
    await client.query("INSERT INTO treatment_plan_presentations(tenant_id,treatment_plan_id,version_number,presented_by,presented_at) VALUES($1,$2,1,$3,'2026-09-05T10:00:00Z')",
      [tenantId,planId,userId]);
    await client.query("INSERT INTO treatment_plan_acceptances(tenant_id,treatment_plan_id,treatment_plan_item_id,accepted_by,recorded_by,accepted_at) VALUES($1,$2,$3,'patient',$4,'2026-09-06T10:00:00Z')",
      [tenantId,planId,itemId,userId]);

    const laboratoryId=randomUUID(),labCaseId=randomUUID();
    await client.query("INSERT INTO laboratories(id,tenant_id,organization_id,code,name) VALUES($1,$2,$3,'lab','Lab')",[laboratoryId,tenantId,organizationId]);
    await client.query(`INSERT INTO lab_cases(id,tenant_id,organization_id,laboratory_id,patient_id,responsible_doctor_id,status)
      VALUES($1,$2,$3,$4,$5,$6,'completed')`,[labCaseId,tenantId,organizationId,laboratoryId,patientId,doctorId]);
    await client.query(`INSERT INTO lab_case_items(tenant_id,organization_id,lab_case_id,procedure_id,description,cost_minor,currency)
      VALUES($1,$2,$3,$4,'Implant crown',2000,'KZT')`,[tenantId,organizationId,labCaseId,procedureId]);

    const sourceId=randomUUID(),leadId=randomUUID();
    await client.query("INSERT INTO lead_sources(id,tenant_id,organization_id,code,name) VALUES($1,$2,$3,'search','Search')",[sourceId,tenantId,organizationId]);
    await client.query(`INSERT INTO leads(id,tenant_id,organization_id,branch_id,source_id,patient_id,first_name,phone,phone_normalized,status,converted_at,created_at)
      VALUES($1,$2,$3,$4,$5,$6,'Pat','1','1','converted','2026-09-02T10:00:00Z','2026-09-01T10:00:00Z')`,
      [leadId,tenantId,organizationId,branchId,sourceId,patientId]);

    const unitId=randomUUID(),productId=randomUUID(),warehouseId=randomUUID(),batchId=randomUUID();
    await client.query("INSERT INTO units_of_measure(id,tenant_id,organization_id,code,name,symbol) VALUES($1,$2,$3,'pc','Piece','pc')",[unitId,tenantId,organizationId]);
    await client.query("INSERT INTO products(id,tenant_id,organization_id,unit_id,sku,name,minimum_stock) VALUES($1,$2,$3,$4,'mat','Material',3)",
      [productId,tenantId,organizationId,unitId]);
    await client.query("INSERT INTO warehouses(id,tenant_id,organization_id,branch_id,code,name) VALUES($1,$2,$3,$4,'main','Main stock')",
      [warehouseId,tenantId,organizationId,branchId]);
    await client.query("INSERT INTO product_batches(id,tenant_id,organization_id,product_id,lot_number,purchase_price_minor,currency) VALUES($1,$2,$3,$4,'lot',100,'KZT')",
      [batchId,tenantId,organizationId,productId]);
    for(const movement of [{type:"receipt",quantity:10,date:"2026-08-20T10:00:00Z"},{type:"consumption",quantity:-2,date:"2026-09-10T10:00:00Z"}]){
      const documentId=randomUUID(),lineId=randomUUID();await client.query(`INSERT INTO stock_documents(id,tenant_id,organization_id,document_type,status,
        destination_warehouse_id,occurred_at,posted_at,posted_by) VALUES($1,$2,$3,$4,'posted',$5,$6,$6,$7)`,
        [documentId,tenantId,organizationId,movement.type,warehouseId,movement.date,userId]);
      await client.query(`INSERT INTO stock_document_lines(id,tenant_id,organization_id,document_id,product_id,batch_id,requested_quantity)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[lineId,tenantId,organizationId,documentId,productId,batchId,Math.abs(movement.quantity)]);
      await client.query(`INSERT INTO stock_movements(tenant_id,organization_id,warehouse_id,product_id,batch_id,document_id,document_line_id,
        quantity_delta,occurred_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [tenantId,organizationId,warehouseId,productId,batchId,documentId,lineId,movement.quantity,movement.date,userId]);}

    const database={withTenant:async<T>(_context:unknown,callback:(connection:PoolClient)=>Promise<T>)=>callback(client as unknown as PoolClient)};
    analytics=new AnalyticsService(database as DatabaseService,new AuditService(),new OutboxService());
    auth={tenantId,userId,membershipId:randomUUID(),subject:"test",permissions:new Set(),tenantWide:true,organizationIds:new Set(),branchIds:new Set(),requestId:randomUUID()};
    const campaign=await analytics.createCampaign(auth,{organizationId,sourceId,code:"search-2026",name:"Search 2026",currency:"KZT",startsOn:"2026-09-01"});
    campaignId=String(campaign.id);await analytics.recordSpend(auth,campaignId,{occurredOn:"2026-09-03",amountMinor:2000,idempotencyKey:"analytics-spend-1"});
    await analytics.createAttribution(auth,{campaignId,patientId,leadId,branchId,model:"first_touch",attributedAt:"2026-09-02T10:00:00.000Z"});
  });

  afterAll(async()=>{await client.query("ROLLBACK");await client.end();});

  it("calculates accepted value from immutable presentation and acceptance events",async()=>{
    const result=await analytics.treatmentAcceptance(auth,range);expect(result.summary).toMatchObject({presentedItems:1,acceptedItems:1,
      presentedAmountMinor:10000,acceptedAmountMinor:10000,itemAcceptanceRateBps:10000});
  });
  it("reports chair production and contribution margin without double counting",async()=>{
    const chairs=await analytics.chairEconomics(auth,range);expect(chairs.chairs[0]).toMatchObject({chairId,completedMinutes:60,revenueMinor:10000,
      revenuePerCompletedHourMinor:10000});const margin=await analytics.contributionMargin(auth,range);
    expect(margin.summary).toMatchObject({revenueMinor:10000,laboratoryCostMinor:2000,contributionMarginMinor:8000,contributionMarginBps:8000});
  });
  it("attributes clinical revenue and derives campaign ROAS",async()=>{
    const attribution=await analytics.marketingAttribution(auth,range);expect(attribution.bySource[0]).toMatchObject({sourceName:"Search",leadCount:1,
      conversionCount:1,revenueMinor:10000,conversionRateBps:10000});const roas=await analytics.roas(auth,range);
    expect(roas.campaigns[0]).toMatchObject({campaignId,spendMinor:2000,revenueMinor:10000,roasBps:50000,returnOnAdSpend:5});
  });
  it("derives stock value, usage, and days of stock from immutable movements",async()=>{
    const result=await analytics.inventory(auth,range);expect(result.products[0]).toMatchObject({sku:"mat",onHandQuantity:8,stockValueMinor:800,
      consumedQuantity:2,consumptionCostMinor:200,belowMinimum:false});expect(result.products[0]!.daysOfStock).toBe(120);
  });
});
