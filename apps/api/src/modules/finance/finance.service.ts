import type {
  CloseCashSessionInput, CreateCashboxInput, CreateChargeInput, CreateExpenseCategoryInput,
  CreateExpenseInput, CreatePaymentInput, CreateRefundInput, OpenCashSessionInput
} from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

interface PaymentRow {
  id: string; patientId: string; branchId: string; ledgerTransactionId: string;
  currency: string; totalAmountMinor: string | number; note: string | null; postedAt: Date;
}
interface AccountRow { id: string }
interface MoneyEntry { accountId: string; patientId?: string; amountMinor: number; memo: string }

@Injectable()
export class FinanceService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService,
    private readonly outbox: OutboxService) {}

  createCharge(auth: AuthContext, input: CreateChargeInput) {
    const total = sumMoney(input.items.map((item) => item.quantity * item.unitPriceMinor));
    return this.database.withTenant(auth, async (client) => {
      await this.lockPatient(client, input.patientId);
      await this.assertPatientAndBranch(client, input.patientId, input.branchId);
      const receivable = await this.account(client, auth, `patient-receivable:${input.patientId}`, "Patient receivable",
        "asset", "patient_receivable", input.currency, input.branchId, input.patientId);
      const revenue = await this.account(client, auth, `revenue:${input.currency}`, "Clinical revenue",
        "revenue", "clinical_revenue", input.currency);
      const transactionId = await this.postTransaction(client, auth, "charge", input.currency, input.description ?? "Patient charge");
      const charge = (await client.query<{ id: string; postedAt: Date }>(`INSERT INTO charges
        (tenant_id,patient_id,branch_id,encounter_id,ledger_transaction_id,currency,total_amount_minor,description,posted_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,posted_at AS "postedAt"`,
        [auth.tenantId,input.patientId,input.branchId,input.encounterId ?? null,transactionId,input.currency,total,
          input.description ?? null,auth.userId])).rows[0]!;
      const items = [];
      for (const item of input.items) {
        const itemTotal = item.quantity * item.unitPriceMinor;
        const created = (await client.query(`INSERT INTO charge_items
          (tenant_id,charge_id,service_id,procedure_id,description,quantity,unit_price_minor,total_amount_minor)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,service_id AS "serviceId",procedure_id AS "procedureId",
          description,quantity,unit_price_minor::text AS "unitPriceMinor",total_amount_minor::text AS "totalAmountMinor"`,
          [auth.tenantId,charge.id,item.serviceId ?? null,item.procedureId ?? null,item.description,item.quantity,
            item.unitPriceMinor,itemTotal])).rows[0]!;
        items.push(moneyObject(created));
      }
      await this.entries(client, auth, transactionId, [
        { accountId: receivable, patientId: input.patientId, amountMinor: total, memo: "Patient charge" },
        { accountId: revenue, patientId: input.patientId, amountMinor: -total, memo: "Clinical revenue" }
      ]);
      const result = { id: charge.id, patientId: input.patientId, branchId: input.branchId,
        encounterId: input.encounterId ?? null, transactionId, currency: input.currency, totalAmountMinor: total,
        description: input.description ?? null, postedAt: charge.postedAt.toISOString(), items };
      await this.record(client,auth,"charge.posted","ChargePosted","charge",charge.id,result,{ chargeId: charge.id, patientId: input.patientId });
      return result;
    });
  }

  createPayment(auth: AuthContext, idempotencyKey: string, input: CreatePaymentInput) {
    const total = sumMoney(input.parts.map((part) => part.amountMinor));
    const allocations = combine(input.allocations, (item) => item.chargeId);
    const allocated = sumMoney([...allocations.values()]);
    const depositFunded = sumMoney(input.parts.filter((part) => part.method === "deposit").map((part) => part.amountMinor));
    if (allocated > total) throw bad("PAYMENT_OVERALLOCATED", "Payment allocations exceed payment total");
    if (depositFunded > allocated) throw bad("DEPOSIT_CANNOT_BE_REDEPOSITED", "Deposit-funded amount must be allocated to charges");
    return this.database.withTenant(auth, async (client) => {
      const existing = (await client.query<{ id: string }>("SELECT id FROM payments WHERE idempotency_key=$1", [idempotencyKey])).rows[0];
      if (existing) return this.paymentAggregate(client, existing.id);
      await this.lockPatient(client, input.patientId);
      await this.assertPatientAndBranch(client, input.patientId, input.branchId);
      for (const [chargeId, amount] of allocations) await this.assertChargeOutstanding(client, chargeId, input.patientId, input.currency, amount);
      const transactionId = await this.postTransaction(client,auth,"payment",input.currency,input.note ?? "Patient payment",idempotencyKey);
      const payment = (await client.query<{ id: string; postedAt: Date }>(`INSERT INTO payments
        (tenant_id,patient_id,branch_id,ledger_transaction_id,currency,total_amount_minor,note,idempotency_key,posted_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,posted_at AS "postedAt"`,
        [auth.tenantId,input.patientId,input.branchId,transactionId,input.currency,total,input.note ?? null,idempotencyKey,auth.userId])).rows[0]!;
      const ledgerEntries: MoneyEntry[] = [];
      const parts = [];
      for (const part of input.parts) {
        const source = part.method === "deposit"
          ? await this.depositSource(client, input.patientId, input.currency, part.depositId!, part.amountMinor)
          : await this.externalPaymentSource(client,auth,input.branchId,input.currency,part.method,part.cashboxId);
        const created = (await client.query<{ id: string }>(`INSERT INTO payment_parts
          (tenant_id,payment_id,method,amount_minor,account_id,cashbox_id,deposit_id,reference)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [auth.tenantId,payment.id,part.method,part.amountMinor,source.accountId,part.cashboxId ?? null,
            part.depositId ?? null,part.reference ?? null])).rows[0]!;
        if (part.method === "deposit") await client.query(`INSERT INTO deposit_allocations
          (tenant_id,deposit_id,payment_part_id,amount_minor) VALUES ($1,$2,$3,$4)`,
          [auth.tenantId,part.depositId,created.id,part.amountMinor]);
        if (part.method === "cash") await client.query(`INSERT INTO cash_transactions
          (tenant_id,cashbox_id,cash_session_id,direction,amount_minor,source_type,source_id,recorded_by)
          VALUES ($1,$2,$3,'inflow',$4,'payment_part',$5,$6)`,
          [auth.tenantId,part.cashboxId,source.cashSessionId,part.amountMinor,created.id,auth.userId]);
        ledgerEntries.push({ accountId: source.accountId, patientId: input.patientId, amountMinor: part.amountMinor,
          memo: `Payment: ${part.method}` });
        parts.push({ id: created.id, ...part });
      }
      const allocationRows = [];
      for (const [chargeId, amountMinor] of allocations) {
        const row = (await client.query<{ id: string }>(`INSERT INTO payment_allocations
          (tenant_id,payment_id,charge_id,amount_minor) VALUES ($1,$2,$3,$4) RETURNING id`,
          [auth.tenantId,payment.id,chargeId,amountMinor])).rows[0]!;
        allocationRows.push({ id: row.id, chargeId, amountMinor });
      }
      const receivable = allocated > 0 ? await this.account(client,auth,`patient-receivable:${input.patientId}`,"Patient receivable",
        "asset","patient_receivable",input.currency,input.branchId,input.patientId) : null;
      if (receivable) ledgerEntries.push({ accountId: receivable, patientId: input.patientId, amountMinor: -allocated, memo: "Charge settlement" });
      const depositAmount = total - allocated;
      let createdDeposit: { id: string; amountMinor: number } | null = null;
      if (depositAmount > 0) {
        const liability = await this.account(client,auth,`patient-deposit:${input.patientId}`,"Patient deposit",
          "liability","patient_deposit",input.currency,input.branchId,input.patientId);
        const deposit = (await client.query<{ id: string }>(`INSERT INTO patient_deposits
          (tenant_id,patient_id,source_payment_id,liability_account_id,currency,original_amount_minor,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [auth.tenantId,input.patientId,payment.id,liability,input.currency,depositAmount,auth.userId])).rows[0]!;
        ledgerEntries.push({ accountId: liability, patientId: input.patientId, amountMinor: -depositAmount, memo: "Deposit received" });
        createdDeposit = { id: deposit.id, amountMinor: depositAmount };
      }
      await this.entries(client,auth,transactionId,ledgerEntries);
      const result = { id: payment.id, patientId: input.patientId, branchId: input.branchId, transactionId,
        currency: input.currency, totalAmountMinor: total, allocatedAmountMinor: allocated, depositAmountMinor: depositAmount,
        note: input.note ?? null, postedAt: payment.postedAt.toISOString(), parts, allocations: allocationRows, deposit: createdDeposit };
      await this.record(client,auth,"payment.posted","PaymentPosted","payment",payment.id,result,
        { paymentId: payment.id, patientId: input.patientId, totalAmountMinor: total });
      return result;
    });
  }

  getPayment(auth: AuthContext, id: string) {
    return this.database.withTenant(auth, (client) => this.paymentAggregate(client,id));
  }

  refund(auth: AuthContext, paymentId: string, idempotencyKey: string, input: CreateRefundInput) {
    const sources = combine(input.parts,(item) => item.paymentPartId);
    const targets = combine(input.allocations,(item) => item.paymentAllocationId ? `allocation:${item.paymentAllocationId}` : `deposit:${item.depositId!}`);
    const total = sumMoney([...sources.values()]);
    if (total !== sumMoney([...targets.values()])) throw bad("REFUND_NOT_BALANCED", "Refund parts and allocations must have equal totals");
    return this.database.withTenant(auth, async (client) => {
      const existing = (await client.query<Record<string,unknown>>("SELECT id,total_amount_minor::text AS \"totalAmountMinor\",reason,posted_at AS \"postedAt\" FROM refunds WHERE idempotency_key=$1",[idempotencyKey])).rows[0];
      if (existing) return moneyObject(existing);
      const payment = await this.findPayment(client,paymentId,true);
      await this.lockPatient(client,payment.patientId);
      const sourceRows = new Map<string,{ accountId: string; cashboxId: string | null; method: string; remaining: number }>();
      for (const [partId, amount] of sources) {
        const row = (await client.query<{ accountId:string; cashboxId:string|null; method:string; amountMinor:string; refunded:string }>(`SELECT pp.account_id AS "accountId",pp.cashbox_id AS "cashboxId",pp.method,pp.amount_minor::text AS "amountMinor",
          COALESCE((SELECT sum(ra.amount_minor) FROM refund_allocations ra WHERE ra.payment_part_id=pp.id),0)::text AS refunded
          FROM payment_parts pp WHERE pp.id=$1 AND pp.payment_id=$2 FOR UPDATE`,[partId,paymentId])).rows[0];
        if (!row) throw bad("INVALID_REFUND_PART","Refund source does not belong to the payment");
        const remaining = Number(row.amountMinor)-Number(row.refunded);
        if (amount > remaining) throw bad("REFUND_PART_EXCEEDED","Refund exceeds the remaining payment part",{ paymentPartId: partId, remaining });
        sourceRows.set(partId,{ accountId:row.accountId,cashboxId:row.cashboxId,method:row.method,remaining:amount });
      }
      const targetRows = new Map<string,{ accountId:string; allocationId:string|null; depositId:string|null; remaining:number }>();
      for (const [key,amount] of targets) {
        if (key.startsWith("allocation:")) {
          const allocationId=key.slice(11);
          const row=(await client.query<{ amountMinor:string; refunded:string }>(`SELECT pa.amount_minor::text AS "amountMinor",
            COALESCE((SELECT sum(ra.amount_minor) FROM refund_allocations ra WHERE ra.payment_allocation_id=pa.id),0)::text AS refunded
            FROM payment_allocations pa WHERE pa.id=$1 AND pa.payment_id=$2 FOR UPDATE`,[allocationId,paymentId])).rows[0];
          if (!row) throw bad("INVALID_REFUND_ALLOCATION","Refund allocation does not belong to the payment");
          const remaining=Number(row.amountMinor)-Number(row.refunded);
          if(amount>remaining) throw bad("REFUND_ALLOCATION_EXCEEDED","Refund exceeds the remaining allocation",{ paymentAllocationId:allocationId,remaining });
          const accountId=await this.account(client,auth,`patient-receivable:${payment.patientId}`,"Patient receivable",
            "asset","patient_receivable",payment.currency,payment.branchId,payment.patientId);
          targetRows.set(key,{accountId,allocationId,depositId:null,remaining:amount});
        } else {
          const depositId=key.slice(8);
          const deposit=await this.depositSource(client,payment.patientId,payment.currency,depositId,amount,true,paymentId);
          targetRows.set(key,{accountId:deposit.accountId,allocationId:null,depositId,remaining:amount});
        }
      }
      const transactionId=await this.postTransaction(client,auth,"refund",payment.currency,input.reason,idempotencyKey,payment.ledgerTransactionId);
      const refund=(await client.query<{id:string;postedAt:Date}>(`INSERT INTO refunds
        (tenant_id,payment_id,ledger_transaction_id,total_amount_minor,reason,idempotency_key,posted_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,posted_at AS "postedAt"`,
        [auth.tenantId,paymentId,transactionId,total,input.reason,idempotencyKey,auth.userId])).rows[0]!;
      const entries:MoneyEntry[]=[];
      for(const source of sourceRows.values()) entries.push({accountId:source.accountId,patientId:payment.patientId,
        amountMinor:-source.remaining,memo:`Refund source: ${source.method}`});
      for(const target of targetRows.values()) entries.push({accountId:target.accountId,patientId:payment.patientId,
        amountMinor:target.remaining,memo:target.allocationId ? "Restore patient receivable" : "Return patient deposit"});
      await this.entries(client,auth,transactionId,entries);
      const sourceQueue=[...sourceRows.entries()].map(([id,row])=>({id,...row}));
      const targetQueue=[...targetRows.values()].map((row)=>({...row}));
      let sourceIndex=0; let targetIndex=0;
      while(sourceIndex<sourceQueue.length && targetIndex<targetQueue.length){
        const source=sourceQueue[sourceIndex]!; const target=targetQueue[targetIndex]!;
        const amount=Math.min(source.remaining,target.remaining);
        await client.query(`INSERT INTO refund_allocations
          (tenant_id,refund_id,payment_part_id,payment_allocation_id,deposit_id,amount_minor) VALUES ($1,$2,$3,$4,$5,$6)`,
          [auth.tenantId,refund.id,source.id,target.allocationId,target.depositId,amount]);
        source.remaining-=amount; target.remaining-=amount;
        if(source.remaining===0) sourceIndex++; if(target.remaining===0) targetIndex++;
      }
      const cashRefunds=new Map<string,number>();
      for(const source of sourceRows.values()) if(source.method==="cash" && source.cashboxId)
        cashRefunds.set(source.cashboxId,(cashRefunds.get(source.cashboxId) ?? 0)+source.remaining);
      for(const [cashboxId,amount] of cashRefunds){
        const session=await this.openSession(client,cashboxId);
        await client.query(`INSERT INTO cash_transactions
          (tenant_id,cashbox_id,cash_session_id,direction,amount_minor,source_type,source_id,recorded_by)
          VALUES ($1,$2,$3,'outflow',$4,'refund',$5,$6)`,
          [auth.tenantId,cashboxId,session,amount,refund.id,auth.userId]);
      }
      const result={id:refund.id,paymentId,transactionId,totalAmountMinor:total,reason:input.reason,postedAt:refund.postedAt.toISOString()};
      await this.record(client,auth,"payment.refunded","PaymentRefunded","refund",refund.id,result,
        {refundId:refund.id,paymentId,totalAmountMinor:total});
      return result;
    });
  }

  patientBalance(auth:AuthContext,patientId:string){
    return this.database.withTenant(auth,async(client)=>{
      await this.assertPatient(client,patientId);
      const rows=(await client.query<{currency:string;balanceMinor:string}>(`SELECT a.currency,
        COALESCE(sum(e.amount_minor),0)::text AS "balanceMinor" FROM financial_accounts a
        LEFT JOIN ledger_entries e ON e.account_id=a.id AND e.patient_id=$1
        WHERE a.patient_id=$1 AND a.account_subtype='patient_receivable' GROUP BY a.currency ORDER BY a.currency`,[patientId])).rows;
      return {patientId,balances:rows.map((row)=>({currency:row.currency,balanceMinor:Number(row.balanceMinor)}))};
    });
  }

  patientLedger(auth:AuthContext,patientId:string){
    return this.database.withTenant(auth,async(client)=>{
      await this.assertPatient(client,patientId);
      const rows=(await client.query<Record<string,unknown>>(`SELECT e.id,e.amount_minor::text AS "amountMinor",e.memo,
        a.code AS "accountCode",a.name AS "accountName",a.account_type AS "accountType",a.account_subtype AS "accountSubtype",
        t.id AS "transactionId",t.transaction_type AS "transactionType",t.currency,t.description,t.posted_at AS "postedAt"
        FROM ledger_entries e JOIN financial_accounts a ON a.id=e.account_id
        JOIN ledger_transactions t ON t.id=e.transaction_id WHERE e.patient_id=$1 ORDER BY t.posted_at,e.created_at,e.id`,[patientId])).rows;
      return rows.map(moneyObject);
    });
  }

  patientDeposits(auth:AuthContext,patientId:string){
    return this.database.withTenant(auth,async(client)=>{
      await this.assertPatient(client,patientId);
      const rows=(await client.query<Record<string,unknown>>(`SELECT d.id,d.currency,d.original_amount_minor::text AS "originalAmountMinor",
        (d.original_amount_minor-COALESCE((SELECT sum(da.amount_minor) FROM deposit_allocations da WHERE da.deposit_id=d.id),0)
         +COALESCE((SELECT sum(ra.amount_minor) FROM refund_allocations ra JOIN payment_parts pp ON pp.id=ra.payment_part_id
           WHERE pp.deposit_id=d.id),0)-COALESCE((SELECT sum(ra.amount_minor) FROM refund_allocations ra WHERE ra.deposit_id=d.id),0))::text AS "availableAmountMinor",
        d.created_at AS "createdAt" FROM patient_deposits d WHERE d.patient_id=$1 ORDER BY d.created_at`,[patientId])).rows;
      return rows.map(moneyObject);
    });
  }

  createCashbox(auth:AuthContext,input:CreateCashboxInput){
    return this.database.withTenant(auth,async(client)=>{
      const branch=(await client.query("SELECT 1 FROM branches WHERE id=$1 AND archived_at IS NULL",[input.branchId])).rows[0];
      if(!branch) throw new ApiException(HttpStatus.NOT_FOUND,"BRANCH_NOT_FOUND","Branch not found");
      const accountId=await this.account(client,auth,`cashbox:${input.branchId}:${input.code}`,input.name,"asset","cash",input.currency,input.branchId);
      const row=(await client.query<Record<string,unknown>>(`INSERT INTO cashboxes
        (tenant_id,branch_id,financial_account_id,code,name,currency,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id,branch_id AS "branchId",code,name,currency,created_at AS "createdAt"`,
        [auth.tenantId,input.branchId,accountId,input.code,input.name,input.currency,auth.userId])).rows[0]!;
      await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action:"cashbox.created",entityType:"cashbox",
        entityId:String(row.id),after:row,requestId:auth.requestId}); return row;
    });
  }

  openCashSession(auth:AuthContext,cashboxId:string,input:OpenCashSessionInput){
    return this.database.withTenant(auth,async(client)=>{
      const box=(await client.query("SELECT 1 FROM cashboxes WHERE id=$1 AND archived_at IS NULL",[cashboxId])).rows[0];
      if(!box) throw new ApiException(HttpStatus.NOT_FOUND,"CASHBOX_NOT_FOUND","Cashbox not found");
      try{
        const row=(await client.query<Record<string,unknown>>(`INSERT INTO cash_sessions
          (tenant_id,cashbox_id,opening_amount_minor,opened_by) VALUES ($1,$2,$3,$4)
          RETURNING id,cashbox_id AS "cashboxId",status,opening_amount_minor::text AS "openingAmountMinor",opened_at AS "openedAt"`,
          [auth.tenantId,cashboxId,input.openingAmountMinor,auth.userId])).rows[0]!;
        await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action:"cash_session.opened",
          entityType:"cash_session",entityId:String(row.id),after:moneyObject(row),requestId:auth.requestId}); return moneyObject(row);
      }catch(error){if(isUniqueViolation(error)) throw new ApiException(HttpStatus.CONFLICT,"CASH_SESSION_ALREADY_OPEN","Cashbox already has an open session"); throw error;}
    });
  }

  closeCashSession(auth:AuthContext,id:string,input:CloseCashSessionInput){
    return this.database.withTenant(auth,async(client)=>{
      const row=(await client.query<{opening:string;status:string}>(`SELECT opening_amount_minor::text AS opening,status FROM cash_sessions WHERE id=$1 FOR UPDATE`,[id])).rows[0];
      if(!row) throw new ApiException(HttpStatus.NOT_FOUND,"CASH_SESSION_NOT_FOUND","Cash session not found");
      if(row.status!=="open") throw new ApiException(HttpStatus.CONFLICT,"CASH_SESSION_CLOSED","Cash session is already closed");
      const movement=(await client.query<{amount:string}>(`SELECT COALESCE(sum(CASE direction WHEN 'inflow' THEN amount_minor ELSE -amount_minor END),0)::text AS amount
        FROM cash_transactions WHERE cash_session_id=$1`,[id])).rows[0]!;
      const expected=Number(row.opening)+Number(movement.amount); const discrepancy=input.closingAmountMinor-expected;
      const closed=(await client.query<Record<string,unknown>>(`UPDATE cash_sessions SET status='closed',closing_amount_minor=$2,
        expected_closing_amount_minor=$3,discrepancy_minor=$4,closed_at=now(),closed_by=$5,close_note=$6,version=version+1 WHERE id=$1
        RETURNING id,cashbox_id AS "cashboxId",status,opening_amount_minor::text AS "openingAmountMinor",
        closing_amount_minor::text AS "closingAmountMinor",expected_closing_amount_minor::text AS "expectedClosingAmountMinor",
        discrepancy_minor::text AS "discrepancyMinor",opened_at AS "openedAt",closed_at AS "closedAt"`,
        [id,input.closingAmountMinor,expected,discrepancy,auth.userId,input.note ?? null])).rows[0]!;
      await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action:"cash_session.closed",
        entityType:"cash_session",entityId:id,after:moneyObject(closed),...(input.note ? {reason:input.note}:{}),requestId:auth.requestId});
      return moneyObject(closed);
    });
  }

  createExpenseCategory(auth:AuthContext,input:CreateExpenseCategoryInput){
    return this.database.withTenant(auth,async(client)=>{
      const accountId=await this.account(client,auth,`expense:${input.code}`,input.name,"expense","operating_expense",input.currency);
      const row=(await client.query<Record<string,unknown>>(`INSERT INTO expense_categories
        (tenant_id,code,name,expense_account_id,currency,created_by) VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id,code,name,currency,created_at AS "createdAt"`,[auth.tenantId,input.code,input.name,accountId,input.currency,auth.userId])).rows[0]!;
      return row;
    });
  }

  createExpense(auth:AuthContext,input:CreateExpenseInput){
    return this.database.withTenant(auth,async(client)=>{
      const source=(await client.query<{accountId:string;currency:string}>(`SELECT c.financial_account_id AS "accountId",c.currency
        FROM cashboxes c WHERE c.id=$1 AND c.branch_id=$2 AND c.archived_at IS NULL`,[input.cashboxId,input.branchId])).rows[0];
      if(!source) throw bad("INVALID_EXPENSE_CASHBOX","Cashbox does not belong to the branch");
      const category=(await client.query<{accountId:string;currency:string}>(`SELECT expense_account_id AS "accountId",currency
        FROM expense_categories WHERE id=$1 AND archived_at IS NULL`,[input.categoryId])).rows[0];
      if(!category) throw new ApiException(HttpStatus.NOT_FOUND,"EXPENSE_CATEGORY_NOT_FOUND","Expense category not found");
      if(category.currency!==source.currency) throw bad("EXPENSE_CURRENCY_MISMATCH","Expense category and cashbox currencies differ");
      const session=await this.openSession(client,input.cashboxId);
      const transactionId=await this.postTransaction(client,auth,"expense",source.currency,input.description);
      const expense=(await client.query<{id:string;postedAt:Date}>(`INSERT INTO expenses
        (tenant_id,branch_id,category_id,cashbox_id,cash_session_id,ledger_transaction_id,amount_minor,description,occurred_at,posted_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,posted_at AS "postedAt"`,
        [auth.tenantId,input.branchId,input.categoryId,input.cashboxId,session,transactionId,input.amountMinor,input.description,
          input.occurredAt ?? new Date().toISOString(),auth.userId])).rows[0]!;
      await this.entries(client,auth,transactionId,[
        {accountId:category.accountId,amountMinor:input.amountMinor,memo:input.description},
        {accountId:source.accountId,amountMinor:-input.amountMinor,memo:input.description}
      ]);
      await client.query(`INSERT INTO cash_transactions
        (tenant_id,cashbox_id,cash_session_id,direction,amount_minor,source_type,source_id,occurred_at,recorded_by)
        VALUES ($1,$2,$3,'outflow',$4,'expense',$5,$6,$7)`,
        [auth.tenantId,input.cashboxId,session,input.amountMinor,expense.id,input.occurredAt ?? new Date().toISOString(),auth.userId]);
      const result={id:expense.id,transactionId,amountMinor:input.amountMinor,currency:source.currency,
        description:input.description,postedAt:expense.postedAt.toISOString()};
      await this.record(client,auth,"expense.posted","ExpensePosted","expense",expense.id,result,{expenseId:expense.id}); return result;
    });
  }

  private async paymentAggregate(client:PoolClient,id:string){
    const payment=await this.findPayment(client,id);
    const parts=(await client.query<Record<string,unknown>>(`SELECT id,method,amount_minor::text AS "amountMinor",cashbox_id AS "cashboxId",
      deposit_id AS "depositId",reference FROM payment_parts WHERE payment_id=$1 ORDER BY created_at,id`,[id])).rows.map(moneyObject);
    const allocations=(await client.query<Record<string,unknown>>(`SELECT id,charge_id AS "chargeId",amount_minor::text AS "amountMinor"
      FROM payment_allocations WHERE payment_id=$1 ORDER BY created_at,id`,[id])).rows.map(moneyObject);
    const deposit=(await client.query<Record<string,unknown>>(`SELECT id,original_amount_minor::text AS "amountMinor" FROM patient_deposits
      WHERE source_payment_id=$1`,[id])).rows[0];
    return {id:payment.id,patientId:payment.patientId,branchId:payment.branchId,transactionId:payment.ledgerTransactionId,
      currency:payment.currency,totalAmountMinor:Number(payment.totalAmountMinor),note:payment.note,
      postedAt:payment.postedAt.toISOString(),parts,allocations,deposit:deposit ? moneyObject(deposit):null};
  }

  private async findPayment(client:PoolClient,id:string,lock=false){
    const row=(await client.query<PaymentRow>(`SELECT id,patient_id AS "patientId",branch_id AS "branchId",
      ledger_transaction_id AS "ledgerTransactionId",currency,total_amount_minor::text AS "totalAmountMinor",note,posted_at AS "postedAt"
      FROM payments WHERE id=$1${lock ? " FOR UPDATE":""}`,[id])).rows[0];
    if(!row) throw new ApiException(HttpStatus.NOT_FOUND,"PAYMENT_NOT_FOUND","Payment not found"); return row;
  }

  private async assertPatientAndBranch(client:PoolClient,patientId:string,branchId:string){
    await this.assertPatient(client,patientId);
    if(!(await client.query("SELECT 1 FROM branches WHERE id=$1 AND archived_at IS NULL",[branchId])).rows[0])
      throw new ApiException(HttpStatus.NOT_FOUND,"BRANCH_NOT_FOUND","Branch not found");
  }
  private async assertPatient(client:PoolClient,patientId:string){
    if(!(await client.query("SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL",[patientId])).rows[0])
      throw new ApiException(HttpStatus.NOT_FOUND,"PATIENT_NOT_FOUND","Patient not found");
  }
  private async lockPatient(client:PoolClient,patientId:string){
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[patientId]);
  }
  private async assertChargeOutstanding(client:PoolClient,chargeId:string,patientId:string,currency:string,amount:number){
    const row=(await client.query<{patientId:string;currency:string;outstanding:string}>(`SELECT c.patient_id AS "patientId",c.currency,
      (c.total_amount_minor-COALESCE((SELECT sum(pa.amount_minor) FROM payment_allocations pa WHERE pa.charge_id=c.id),0)
       +COALESCE((SELECT sum(ra.amount_minor) FROM refund_allocations ra JOIN payment_allocations pa ON pa.id=ra.payment_allocation_id
         WHERE pa.charge_id=c.id),0))::text AS outstanding FROM charges c WHERE c.id=$1 FOR UPDATE`,[chargeId])).rows[0];
    if(!row || row.patientId!==patientId) throw bad("INVALID_PAYMENT_CHARGE","Charge does not belong to the patient");
    if(row.currency!==currency) throw bad("PAYMENT_CURRENCY_MISMATCH","Payment and charge currencies differ");
    if(amount>Number(row.outstanding)) throw bad("CHARGE_OVERPAYMENT","Allocation exceeds charge outstanding amount",
      {chargeId,outstandingAmountMinor:Number(row.outstanding)});
  }
  private async depositSource(client:PoolClient,patientId:string,currency:string,depositId:string,amount:number,
    isRefundTarget=false,sourcePaymentId?:string){
    const row=(await client.query<{accountId:string;patientId:string;currency:string;available:string;sourcePaymentId:string}>(`SELECT d.liability_account_id AS "accountId",d.patient_id AS "patientId",d.currency,d.source_payment_id AS "sourcePaymentId",
      (d.original_amount_minor-COALESCE((SELECT sum(da.amount_minor) FROM deposit_allocations da WHERE da.deposit_id=d.id),0)
       +COALESCE((SELECT sum(ra.amount_minor) FROM refund_allocations ra JOIN payment_parts pp ON pp.id=ra.payment_part_id WHERE pp.deposit_id=d.id),0)
       -COALESCE((SELECT sum(ra.amount_minor) FROM refund_allocations ra WHERE ra.deposit_id=d.id),0))::text AS available
      FROM patient_deposits d WHERE d.id=$1 FOR UPDATE`,[depositId])).rows[0];
    if(!row || row.patientId!==patientId) throw bad("INVALID_DEPOSIT","Deposit does not belong to the patient");
    if(row.currency!==currency) throw bad("DEPOSIT_CURRENCY_MISMATCH","Deposit and payment currencies differ");
    if(isRefundTarget && row.sourcePaymentId!==sourcePaymentId) throw bad("INVALID_REFUND_DEPOSIT","Deposit was not created by this payment");
    if(amount>Number(row.available)) throw bad("INSUFFICIENT_DEPOSIT","Deposit has insufficient available funds",
      {depositId,availableAmountMinor:Number(row.available)});
    return {accountId:row.accountId,cashSessionId:null};
  }
  private async externalPaymentSource(client:PoolClient,auth:AuthContext,branchId:string,currency:string,method:string,cashboxId?:string){
    if(method==="cash"){
      const row=(await client.query<{accountId:string;branchId:string;currency:string}>(`SELECT financial_account_id AS "accountId",
        branch_id AS "branchId",currency FROM cashboxes WHERE id=$1 AND archived_at IS NULL`,[cashboxId])).rows[0];
      if(!row || row.branchId!==branchId) throw bad("INVALID_PAYMENT_CASHBOX","Cashbox does not belong to the payment branch");
      if(row.currency!==currency) throw bad("PAYMENT_CURRENCY_MISMATCH","Cashbox and payment currencies differ");
      return {accountId:row.accountId,cashSessionId:await this.openSession(client,cashboxId!)};
    }
    const accountId=await this.account(client,auth,`${method}:${branchId}`,`${method} clearing`,"asset",method,currency,branchId);
    return {accountId,cashSessionId:null};
  }
  private async openSession(client:PoolClient,cashboxId:string){
    const row=(await client.query<{id:string}>("SELECT id FROM cash_sessions WHERE cashbox_id=$1 AND status='open' FOR UPDATE",[cashboxId])).rows[0];
    if(!row) throw new ApiException(HttpStatus.CONFLICT,"CASH_SESSION_REQUIRED","An open cash session is required"); return row.id;
  }
  private async account(client:PoolClient,auth:AuthContext,code:string,name:string,type:string,subtype:string,currency:string,
    branchId?:string,patientId?:string){
    const row=(await client.query<AccountRow>(`INSERT INTO financial_accounts
      (tenant_id,branch_id,patient_id,code,name,account_type,account_subtype,currency,is_system,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)
      ON CONFLICT (tenant_id,code,currency) DO UPDATE SET name=financial_accounts.name RETURNING id`,
      [auth.tenantId,branchId ?? null,patientId ?? null,code,name,type,subtype,currency,auth.userId])).rows[0]!; return row.id;
  }
  private async postTransaction(client:PoolClient,auth:AuthContext,type:string,currency:string,description:string,
    idempotencyKey?:string,reversesId?:string){
    return (await client.query<{id:string}>(`INSERT INTO ledger_transactions
      (tenant_id,transaction_type,currency,description,idempotency_key,reverses_transaction_id,posted_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [auth.tenantId,type,currency,description,idempotencyKey ?? null,reversesId ?? null,auth.userId])).rows[0]!.id;
  }
  private async entries(client:PoolClient,auth:AuthContext,transactionId:string,entries:MoneyEntry[]){
    if(sumMoney(entries.map((entry)=>entry.amountMinor),true)!==0 || entries.length<2) throw new Error("Unbalanced ledger transaction");
    for(const entry of entries) await client.query(`INSERT INTO ledger_entries
      (tenant_id,transaction_id,account_id,patient_id,amount_minor,memo) VALUES ($1,$2,$3,$4,$5,$6)`,
      [auth.tenantId,transactionId,entry.accountId,entry.patientId ?? null,entry.amountMinor,entry.memo]);
  }
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,entityType:string,id:string,after:unknown,payload:Record<string,unknown>){
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType,entityId:id,after,requestId:auth.requestId});
    await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,aggregateId:id,eventType,payload,requestId:auth.requestId});
  }
}

export function sumMoney(values:Iterable<number>,allowNegative=false):number{
  let total=0; for(const value of values){
    if(!Number.isSafeInteger(value) || (!allowNegative && value<0)) throw bad("INVALID_MONEY_AMOUNT","Money amount must be a safe integer");
    total+=value; if(!Number.isSafeInteger(total)) throw bad("MONEY_AMOUNT_OVERFLOW","Money total exceeds the safe integer range");
  } return total;
}
function combine<T>(items:T[],key:(item:T)=>string){const result=new Map<string,number>(); for(const item of items){
  const amount=(item as T & {amountMinor:number}).amountMinor; result.set(key(item),(result.get(key(item)) ?? 0)+amount);
} return result;}
function moneyObject<T extends Record<string,unknown>>(row:T):T{const result={...row}; for(const [key,value] of Object.entries(result))
  if(key.toLowerCase().includes("minor") && typeof value==="string") (result as Record<string,unknown>)[key]=Number(value); return result;}
function bad(code:string,message:string,details:Record<string,unknown>={}){return new ApiException(HttpStatus.BAD_REQUEST,code,message,details);}
function isUniqueViolation(error:unknown){return typeof error==="object" && error!==null && "code" in error && error.code==="23505";}
