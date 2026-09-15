import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("finance ledger invariants", () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const tenantId=randomUUID(); const userId=randomUUID(); const organizationId=randomUUID();
  const branchId=randomUUID(); const patientId=randomUUID(); const receivableId=randomUUID(); const cashId=randomUUID();
  const revenueId=randomUUID(); const chargeTransactionId=randomUUID();

  beforeAll(async()=>{
    await client.connect(); await client.query("BEGIN");
    await client.query("INSERT INTO tenants (id,slug,name) VALUES ($1,$2,'Finance Test')",[tenantId,`finance-${tenantId}`]);
    await client.query("INSERT INTO users (id,external_subject,display_name) VALUES ($1,$2,'Cashier')",[userId,`cashier-${userId}`]);
    await client.query("INSERT INTO organizations (id,tenant_id,code,name) VALUES ($1,$2,'main','Clinic')",[organizationId,tenantId]);
    await client.query("INSERT INTO branches (id,tenant_id,organization_id,code,name) VALUES ($1,$2,$3,'main','Branch')",[branchId,tenantId,organizationId]);
    await client.query("INSERT INTO patients (id,tenant_id,first_name,last_name,phone,phone_normalized) VALUES ($1,$2,'A','Patient','1','1')",[patientId,tenantId]);
    await client.query(`INSERT INTO financial_accounts (id,tenant_id,branch_id,patient_id,code,name,account_type,account_subtype,currency)
      VALUES ($1,$2,$3,$4,'receivable','Receivable','asset','patient_receivable','KZT'),
      ($5,$2,$3,NULL,'cash','Cash','asset','cash','KZT'),($6,$2,NULL,NULL,'revenue','Revenue','revenue','clinical_revenue','KZT')`,
      [receivableId,tenantId,branchId,patientId,cashId,revenueId]);
    await post("charge",chargeTransactionId,100_000,receivableId,-100_000,revenueId);
    await post("payment",randomUUID(),70_000,cashId,-70_000,receivableId);
    await post("refund",randomUUID(),20_000,receivableId,-20_000,cashId);
  });

  afterAll(async()=>{await client.query("ROLLBACK"); await client.end();});

  it("reconstructs patient debt only from receivable ledger entries",async()=>{
    const result=await client.query<{balance:string}>(`SELECT sum(e.amount_minor)::text AS balance FROM ledger_entries e
      JOIN financial_accounts a ON a.id=e.account_id WHERE e.patient_id=$1 AND a.account_subtype='patient_receivable'`,[patientId]);
    expect(Number(result.rows[0]!.balance)).toBe(50_000);
  });

  it("rejects silent changes to posted finance rows",async()=>{
    await client.query("SAVEPOINT immutable_finance");
    await expect(client.query("UPDATE ledger_transactions SET description='changed' WHERE id=$1",[chargeTransactionId]))
      .rejects.toMatchObject({code:"55000"});
    await client.query("ROLLBACK TO SAVEPOINT immutable_finance");
  });

  it("rejects an unbalanced transaction at the deferred constraint boundary",async()=>{
    await client.query("SAVEPOINT unbalanced_finance");
    const transactionId=randomUUID();
    await client.query(`INSERT INTO ledger_transactions (id,tenant_id,transaction_type,currency,posted_by)
      VALUES ($1,$2,'adjustment','KZT',$3)`,[transactionId,tenantId,userId]);
    await client.query(`INSERT INTO ledger_entries (tenant_id,transaction_id,account_id,patient_id,amount_minor)
      VALUES ($1,$2,$3,$4,10)`,[tenantId,transactionId,receivableId,patientId]);
    await expect(client.query("SET CONSTRAINTS ledger_entries_balanced IMMEDIATE")).rejects.toMatchObject({code:"23514"});
    await client.query("ROLLBACK TO SAVEPOINT unbalanced_finance");
    await client.query("SET CONSTRAINTS ledger_entries_balanced DEFERRED");
  });

  async function post(type:string,transactionId:string,firstAmount:number,firstAccount:string,secondAmount:number,secondAccount:string){
    await client.query(`INSERT INTO ledger_transactions (id,tenant_id,transaction_type,currency,posted_by)
      VALUES ($1,$2,$3,'KZT',$4)`,[transactionId,tenantId,type,userId]);
    await client.query(`INSERT INTO ledger_entries (tenant_id,transaction_id,account_id,patient_id,amount_minor)
      VALUES ($1,$2,$3,$4,$5),($1,$2,$6,$4,$7)`,[tenantId,transactionId,firstAccount,patientId,firstAmount,secondAccount,secondAmount]);
  }
});
