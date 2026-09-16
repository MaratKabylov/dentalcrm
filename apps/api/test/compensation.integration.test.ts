import { randomUUID } from "node:crypto";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../src/database/database.service.js";
import { AuditService } from "../src/modules/audit/audit.service.js";
import { CompensationService } from "../src/modules/compensation/compensation.service.js";
import type { AuthContext } from "../src/modules/identity/auth-context.js";
import { OutboxService } from "../src/modules/outbox/outbox.service.js";

const databaseUrl=process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("compensation payroll invariants",()=>{
  const client=new pg.Client({connectionString:databaseUrl});
  const tenantId=randomUUID(),userId=randomUUID(),organizationId=randomUUID(),branchId=randomUUID(),employeeId=randomUUID(),doctorId=randomUUID();
  const patientId=randomUUID(),serviceId=randomUUID(),encounterId=randomUUID(),procedureId=randomUUID(),periodId=randomUUID();
  let service:CompensationService;let auth:AuthContext;

  beforeAll(async()=>{await client.connect();await client.query("BEGIN");
    await client.query("INSERT INTO tenants(id,slug,name) VALUES($1,$2,'Compensation tenant')",[tenantId,`comp-${tenantId}`]);
    await client.query("INSERT INTO users(id,external_subject,display_name) VALUES($1,$2,'Payroll owner')",[userId,`payroll-${userId}`]);
    await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    await client.query("INSERT INTO organizations(id,tenant_id,code,name) VALUES($1,$2,'main','Main')",[organizationId,tenantId]);
    await client.query("INSERT INTO branches(id,tenant_id,organization_id,code,name) VALUES($1,$2,$3,'main','Main')",[branchId,tenantId,organizationId]);
    await client.query(`INSERT INTO employees(id,tenant_id,user_id,first_name,last_name) VALUES($1,$2,$3,'Ada','Doctor')`,[employeeId,tenantId,userId]);
    await client.query("INSERT INTO employee_branches(tenant_id,employee_id,branch_id) VALUES($1,$2,$3)",[tenantId,employeeId,branchId]);
    await client.query("INSERT INTO doctors(id,tenant_id,employee_id) VALUES($1,$2,$3)",[doctorId,tenantId,employeeId]);
    await client.query("INSERT INTO services(id,tenant_id,organization_id,code,name,duration_minutes) VALUES($1,$2,$3,'svc','Service',60)",
      [serviceId,tenantId,organizationId]);
    await client.query("INSERT INTO patients(id,tenant_id,first_name,last_name,phone,phone_normalized) VALUES($1,$2,'Pat','One','1','1')",[patientId,tenantId]);
    await client.query(`INSERT INTO encounters(id,tenant_id,patient_id,doctor_id,branch_id,status) VALUES($1,$2,$3,$4,$5,'completed')`,
      [encounterId,tenantId,patientId,doctorId,branchId]);
    await client.query(`INSERT INTO procedures(id,tenant_id,encounter_id,patient_id,doctor_id,service_id,quantity,status,completed_at)
      VALUES($1,$2,$3,$4,$5,$6,1,'completed','2026-09-10T10:00:00Z')`,[procedureId,tenantId,encounterId,patientId,doctorId,serviceId]);
    const transactionId=randomUUID(),chargeId=randomUUID();
    await client.query(`INSERT INTO ledger_transactions(id,tenant_id,transaction_type,currency,posted_by) VALUES($1,$2,'charge','KZT',$3)`,
      [transactionId,tenantId,userId]);
    await client.query(`INSERT INTO charges(id,tenant_id,patient_id,branch_id,encounter_id,ledger_transaction_id,currency,total_amount_minor,posted_by)
      VALUES($1,$2,$3,$4,$5,$6,'KZT',10000,$7)`,[chargeId,tenantId,patientId,branchId,encounterId,transactionId,userId]);
    await client.query(`INSERT INTO charge_items(tenant_id,charge_id,service_id,procedure_id,description,quantity,unit_price_minor,total_amount_minor)
      VALUES($1,$2,$3,$4,'Service',1,10000,10000)`,[tenantId,chargeId,serviceId,procedureId]);
    for(const rule of [{name:"Doctor percent",type:"percentage",rate:25,amount:null},{name:"Procedure fixed",type:"fixed",rate:null,amount:500},
      {name:"Hourly",type:"hourly",rate:null,amount:1000}]){const ruleId=randomUUID(),versionId=randomUUID();
      await client.query("INSERT INTO compensation_rules(id,tenant_id,organization_id,name) VALUES($1,$2,$3,$4)",[ruleId,tenantId,organizationId,rule.name]);
      await client.query(`INSERT INTO compensation_rule_versions(id,tenant_id,organization_id,rule_id,version_number,calculation_type,
        calculation_basis,rate,amount_minor,currency,valid_from) VALUES($1,$2,$3,$4,1,$5,'gross_service_amount',$6,$7,'KZT','2026-01-01')`,
        [versionId,tenantId,organizationId,ruleId,rule.type,rule.rate,rule.amount]);
      await client.query(`INSERT INTO compensation_rule_conditions(tenant_id,organization_id,rule_version_id,employee_id)
        VALUES($1,$2,$3,$4)`,[tenantId,organizationId,versionId,employeeId]);}
    const timesheetId=randomUUID();
    await client.query(`INSERT INTO timesheets(id,tenant_id,organization_id,employee_id,starts_on,ends_on,status,approved_at,approved_by)
      VALUES($1,$2,$3,$4,'2026-09-01','2026-09-30','approved',now(),$5)`,[timesheetId,tenantId,organizationId,employeeId,userId]);
    await client.query(`INSERT INTO time_entries(tenant_id,organization_id,timesheet_id,branch_id,worked_on,minutes)
      VALUES($1,$2,$3,$4,'2026-09-10',120)`,[tenantId,organizationId,timesheetId,branchId]);
    await client.query(`INSERT INTO payroll_periods(id,tenant_id,organization_id,starts_on,ends_on,currency,created_by)
      VALUES($1,$2,$3,'2026-09-01','2026-09-30','KZT',$4)`,[periodId,tenantId,organizationId,userId]);
    const database={withTenant:async<T>(_context:unknown,callback:(connection:PoolClient)=>Promise<T>)=>callback(client as unknown as PoolClient)};
    service=new CompensationService(database as DatabaseService,new AuditService(),new OutboxService());auth={tenantId,userId,membershipId:randomUUID(),
      subject:"test",permissions:new Set(["compensation.calculate","compensation.approve","compensation.read_all","compensation.read_own"]),tenantWide:true,
      organizationIds:new Set(),branchIds:new Set(),requestId:randomUUID()};
  });

  afterAll(async()=>{await client.query("ROLLBACK");await client.end();});

  it("calculates percentage, fixed, and hourly accruals",async()=>{const result=await service.calculate(auth,periodId);
    expect(result.totals).toHaveLength(1);expect(result.totals[0]!.totalAmountMinor).toBe(5000);
    expect(result.accruals.map((item)=>item.amountMinor).sort((a,b)=>Number(a)-Number(b))).toEqual([500,2000,2500]);
    expect(result.accruals.every((item)=>Boolean(item.ruleSnapshot))).toBe(true);
  });

  it("freezes an approved payroll and exposes it to the employee",async()=>{const approved=await service.approve(auth,periodId);
    expect(approved.totalAmountMinor).toBe(5000);const own=await service.ownPayroll(auth);expect(own[0]).toMatchObject({periodId,totalAmountMinor:5000});
    await expect(service.calculate(auth,periodId)).rejects.toMatchObject({code:"PAYROLL_APPROVED"});
    const accrualId=(await client.query<{id:string}>("SELECT id FROM payroll_accruals WHERE payroll_period_id=$1 LIMIT 1",[periodId])).rows[0]!.id;
    await client.query("SAVEPOINT immutable_payroll");await expect(client.query("DELETE FROM payroll_accruals WHERE id=$1",[accrualId]))
      .rejects.toMatchObject({code:"55000"});await client.query("ROLLBACK TO SAVEPOINT immutable_payroll");
  });
});
