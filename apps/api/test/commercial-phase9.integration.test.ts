import { randomUUID } from "node:crypto";
import pg,{type PoolClient} from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { DatabaseService } from "../src/database/database.service.js";
import { AuditService } from "../src/modules/audit/audit.service.js";
import { InsuranceService } from "../src/modules/commercial/insurance.service.js";
import { LaboratoryService } from "../src/modules/commercial/laboratory.service.js";
import { LoyaltyService } from "../src/modules/commercial/loyalty.service.js";
import type { AuthContext } from "../src/modules/identity/auth-context.js";
import { OutboxService } from "../src/modules/outbox/outbox.service.js";

const databaseUrl=process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("phase 9 commercial invariants",()=>{
  const client=new pg.Client({connectionString:databaseUrl});const tenantId=randomUUID(),userId=randomUUID(),organizationId=randomUUID(),branchId=randomUUID();
  const employeeId=randomUUID(),doctorId=randomUUID(),patientId=randomUUID(),serviceId=randomUUID(),encounterId=randomUUID(),procedureId=randomUUID();
  let auth:AuthContext,laboratory:LaboratoryService,insurance:InsuranceService,loyalty:LoyaltyService,paymentId:string,chargeId:string;

  beforeAll(async()=>{await client.connect();await client.query("BEGIN");await client.query("INSERT INTO tenants(id,slug,name) VALUES($1,$2,'Phase 9 tenant')",
    [tenantId,`phase9-${tenantId}`]);await client.query("INSERT INTO users(id,external_subject,display_name) VALUES($1,$2,'Phase 9 owner')",
    [userId,`phase9-${userId}`]);await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);await client.query("INSERT INTO organizations(id,tenant_id,code,name) VALUES($1,$2,'main','Main')",
      [organizationId,tenantId]);await client.query("INSERT INTO branches(id,tenant_id,organization_id,code,name) VALUES($1,$2,$3,'main','Main')",
      [branchId,tenantId,organizationId]);await client.query("INSERT INTO employees(id,tenant_id,user_id,first_name,last_name) VALUES($1,$2,$3,'Ada','Doctor')",
      [employeeId,tenantId,userId]);await client.query("INSERT INTO employee_branches(tenant_id,employee_id,branch_id) VALUES($1,$2,$3)",[tenantId,employeeId,branchId]);
    await client.query("INSERT INTO doctors(id,tenant_id,employee_id) VALUES($1,$2,$3)",[doctorId,tenantId,employeeId]);
    await client.query("INSERT INTO patients(id,tenant_id,first_name,last_name,phone,phone_normalized) VALUES($1,$2,'Pat','One','1','1')",[patientId,tenantId]);
    await client.query("INSERT INTO services(id,tenant_id,organization_id,code,name,duration_minutes) VALUES($1,$2,$3,'crown','Crown',60)",
      [serviceId,tenantId,organizationId]);await client.query(`INSERT INTO encounters(id,tenant_id,patient_id,doctor_id,branch_id,status)
      VALUES($1,$2,$3,$4,$5,'completed')`,[encounterId,tenantId,patientId,doctorId,branchId]);await client.query(`INSERT INTO procedures
      (id,tenant_id,encounter_id,patient_id,doctor_id,service_id,status,completed_at) VALUES($1,$2,$3,$4,$5,$6,'completed',now())`,
      [procedureId,tenantId,encounterId,patientId,doctorId,serviceId]);const paymentTx=randomUUID(),chargeTx=randomUUID();paymentId=randomUUID();chargeId=randomUUID();
    await client.query(`INSERT INTO ledger_transactions(id,tenant_id,transaction_type,currency,posted_by) VALUES
      ($1,$3,'payment','KZT',$4),($2,$3,'charge','KZT',$4)`,[paymentTx,chargeTx,tenantId,userId]);
    await client.query(`INSERT INTO payments(id,tenant_id,patient_id,branch_id,ledger_transaction_id,currency,total_amount_minor,idempotency_key,posted_by)
      VALUES($1,$2,$3,$4,$5,'KZT',10000,'phase9-payment',$6)`,[paymentId,tenantId,patientId,branchId,paymentTx,userId]);
    await client.query(`INSERT INTO charges(id,tenant_id,patient_id,branch_id,encounter_id,ledger_transaction_id,currency,total_amount_minor,posted_by)
      VALUES($1,$2,$3,$4,$5,$6,'KZT',5000,$7)`,[chargeId,tenantId,patientId,branchId,encounterId,chargeTx,userId]);
    const database={withTenant:async<T>(_context:unknown,callback:(connection:PoolClient)=>Promise<T>)=>callback(client as unknown as PoolClient)};
    const db=database as DatabaseService,audit=new AuditService(),outbox=new OutboxService();laboratory=new LaboratoryService(db,audit,outbox);
    insurance=new InsuranceService(db,audit,outbox);loyalty=new LoyaltyService(db,audit,outbox);auth={tenantId,userId,membershipId:randomUUID(),subject:"test",
      permissions:new Set(),tenantWide:true,organizationIds:new Set(),branchIds:new Set(),requestId:randomUUID()};
  });
  afterAll(async()=>{await client.query("ROLLBACK");await client.end();});

  it("enforces the lab case state machine and immutable invoices",async()=>{const lab=await laboratory.createLaboratory(auth,{organizationId,code:"lab",
    name:"Dental Lab"});const created=await laboratory.createCase(auth,{organizationId,laboratoryId:lab.id,patientId,responsibleDoctorId:doctorId,
    items:[{procedureId,description:"Ceramic crown",toothNumber:11,costMinor:2000,currency:"KZT"}]});
    await expect(laboratory.transition(auth,created.id,{status:"completed"})).rejects.toMatchObject({code:"INVALID_LAB_CASE_TRANSITION"});
    await laboratory.transition(auth,created.id,{status:"sent"});await laboratory.transition(auth,created.id,{status:"in_production"});
    const received=await laboratory.transition(auth,created.id,{status:"received"});expect(received.status).toBe("received");
    const invoice=await laboratory.recordInvoice(auth,created.id,{invoiceNumber:"L-1",totalCostMinor:2000,currency:"KZT",issuedOn:"2026-09-17"});
    await client.query("SAVEPOINT lab_invoice_immutable");await client.query("RESET ROLE");await expect(client.query("UPDATE lab_invoices SET total_cost_minor=1 WHERE id=$1",[invoice.id]))
      .rejects.toMatchObject({code:"55000"});await client.query("ROLLBACK TO SAVEPOINT lab_invoice_immutable");
  });

  it("caps insurance claims and payments at contracted approved amounts",async()=>{const company=await insurance.createCompany(auth,{organizationId,code:"ins",
    name:"Insurance"});const plan=await insurance.createPlan(auth,{companyId:company.id,code:"gold",name:"Gold",currency:"KZT"});
    await insurance.createPriceList(auth,{planId:plan.id,name:"2026",validFrom:"2026-01-01",items:[{serviceId,priceMinor:8000}]});
    const policy=await insurance.createPolicy(auth,{planId:plan.id,patientId,policyNumber:"POL-1",validFrom:"2026-01-01",coveragePercent:50});
    const claim=await insurance.createClaim(auth,{policyId:policy.id,branchId,serviceDate:"2026-09-17",items:[{procedureId,billedAmountMinor:4000}]});
    await insurance.submitClaim(auth,claim.id);const adjudicated=await insurance.adjudicate(auth,claim.id,{items:[{claimItemId:claim.items[0]!.id,
      approvedAmountMinor:3000,reason:"Contract limit"}]});expect(adjudicated).toMatchObject({status:"partially_approved",approvedAmountMinor:3000});
    await insurance.recordPayment(auth,claim.id,{amountMinor:2000,reference:"PAY-1",idempotencyKey:"insurance-pay-1"});
    await expect(insurance.recordPayment(auth,claim.id,{amountMinor:2000,reference:"PAY-X",idempotencyKey:"insurance-pay-x"}))
      .rejects.toMatchObject({code:"INSURANCE_PAYMENT_EXCEEDED"});const paid=await insurance.recordPayment(auth,claim.id,
      {amountMinor:1000,reference:"PAY-2",idempotencyKey:"insurance-pay-2"});expect(paid.claimStatus).toBe("paid");
  });

  it("derives bonus balance from immutable nonnegative transactions",async()=>{const program=await loyalty.createProgram(auth,{organizationId,code:"bonus",
    name:"Bonus",currency:"KZT",earningRateBps:1000,maxRedemptionBps:5000,validFrom:"2026-01-01"});
    const earned=await loyalty.award(auth,program.id,{paymentId,idempotencyKey:"loyalty-earn-1"});expect(earned.points).toBe(1000);
    await expect(loyalty.award(auth,program.id,{paymentId,idempotencyKey:"loyalty-earn-1"})).resolves.toMatchObject({id:earned.id});
    const redeemed=await loyalty.redeem(auth,program.id,{chargeId,points:600,idempotencyKey:"loyalty-redeem-1"});expect(redeemed.points).toBe(-600);
    expect(await loyalty.balance(auth,program.id,patientId)).toMatchObject({balance:400});await client.query("SAVEPOINT bonus_negative");
    await expect(loyalty.adjust(auth,program.id,{patientId,points:-500,reason:"Correction",idempotencyKey:"loyalty-adjust-1"}))
      .rejects.toMatchObject({code:"INSUFFICIENT_BONUS_BALANCE"});await client.query("ROLLBACK TO SAVEPOINT bonus_negative");
    const transactionId=String(earned.id);await client.query("SAVEPOINT bonus_immutable");await client.query("RESET ROLE");
    await expect(client.query("UPDATE bonus_transactions SET points=1 WHERE id=$1",[transactionId])).rejects.toMatchObject({code:"55000"});
    await client.query("ROLLBACK TO SAVEPOINT bonus_immutable");
  });

  it("quotes promotions and enforces coupon usage",async()=>{const from=new Date(Date.now()-60_000).toISOString(),to=new Date(Date.now()+86_400_000).toISOString();
    const promotion=await loyalty.createPromotion(auth,{organizationId,code:"summer",name:"Summer",discountType:"percentage",discountValue:2000,
      validFrom:from,validTo:to,serviceIds:[serviceId],usageLimit:10});await loyalty.createCoupon(auth,{promotionId:promotion.id,code:"SAVE20",
      patientId,maxUses:1});const quote=await loyalty.quote(auth,{organizationId,patientId,serviceId,couponCode:"save20",grossAmountMinor:10000});
    expect(quote).toMatchObject({discountAmountMinor:2000,netAmountMinor:8000});const redemption=await loyalty.redeemPromotion(auth,{organizationId,
      patientId,serviceId,couponCode:"SAVE20",grossAmountMinor:10000,referenceType:"quote",referenceId:randomUUID(),idempotencyKey:"promo-use-1"});
    expect(redemption.discountAmountMinor).toBe(2000);await expect(loyalty.quote(auth,{organizationId,patientId,serviceId,couponCode:"SAVE20",
      grossAmountMinor:10000})).rejects.toMatchObject({code:"COUPON_UNAVAILABLE"});
  });
});
