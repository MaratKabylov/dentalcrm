import type { AdjustLoyaltyInput,AwardLoyaltyInput,CreateCouponInput,CreateLoyaltyProgramInput,CreatePromotionInput,
  QuotePromotionInput,RedeemLoyaltyInput,RedeemPromotionInput } from "@dental/contracts";
import { HttpStatus,Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertOrganizationAccess } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

interface ProgramRow {id:string;organizationId:string;currency:string;ruleId:string;earningRateBps:number;maxRedemptionBps:number}
export interface PromotionQuote {promotionId:string;couponId:string|null;discountAmountMinor:number;grossAmountMinor:number;netAmountMinor:number}

@Injectable()
export class LoyaltyService {
  constructor(private readonly database:DatabaseService,private readonly audit:AuditService,private readonly outbox:OutboxService){}

  createProgram(auth:AuthContext,input:CreateLoyaltyProgramInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);const program=(await client.query<{id:string}>(`INSERT INTO loyalty_programs
      (tenant_id,organization_id,code,name,currency,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
      [auth.tenantId,input.organizationId,input.code,input.name,input.currency,auth.userId])).rows[0]!;const rule=(await client.query<{id:string}>(
      `INSERT INTO loyalty_rules(tenant_id,organization_id,program_id,version_number,earning_rate_bps,max_redemption_bps,valid_from,valid_to,created_by)
       VALUES($1,$2,$3,1,$4,$5,$6,$7,$8) RETURNING id`,[auth.tenantId,input.organizationId,program.id,input.earningRateBps,
      input.maxRedemptionBps,input.validFrom,input.validTo ?? null,auth.userId])).rows[0]!;const result={id:program.id,organizationId:input.organizationId,
      code:input.code,name:input.name,currency:input.currency,rule:{id:rule.id,versionNumber:1,earningRateBps:input.earningRateBps,
      maxRedemptionBps:input.maxRedemptionBps,validFrom:input.validFrom,validTo:input.validTo ?? null}};await this.record(client,auth,
      "loyalty_program.created","LoyaltyProgramCreated","loyalty_program",program.id,result,input.organizationId);return result;});}

  award(auth:AuthContext,programId:string,input:AwardLoyaltyInput){return this.database.withTenant(auth,async(client)=>{const program=await this.program(client,auth,programId);
    const payment=(await client.query<{patientId:string;organizationId:string;currency:string;amountMinor:string;postedAt:Date}>(`SELECT p.patient_id AS "patientId",
      b.organization_id AS "organizationId",p.currency,p.total_amount_minor::text AS "amountMinor",p.posted_at AS "postedAt"
      FROM payments p JOIN branches b ON b.id=p.branch_id WHERE p.id=$1`,[input.paymentId])).rows[0];if(!payment || payment.organizationId!==program.organizationId)
      throw bad("LOYALTY_PAYMENT_SCOPE_MISMATCH","Payment is outside the loyalty program organization");if(payment.currency!==program.currency)
      throw bad("LOYALTY_CURRENCY_MISMATCH","Payment currency does not match loyalty program");const account=await this.account(client,auth,program,payment.patientId);
    const previous=await this.transactionByKey(client,account,input.idempotencyKey);if(previous)return previous;const points=Math.floor(Number(payment.amountMinor)*program.earningRateBps/10_000);
    if(points<=0)throw conflict("LOYALTY_NO_POINTS_EARNED","Payment amount does not earn a whole bonus point");const row=await this.insertTransaction(client,auth,program,
      account,program.ruleId,"earn",points,"payment",input.paymentId,"Points earned from payment",input.idempotencyKey);
    await this.record(client,auth,"loyalty.points_earned","LoyaltyPointsEarned","bonus_transaction",String(row.id),
      {patientId:payment.patientId,paymentId:input.paymentId,points},program.organizationId);return row;});}

  adjust(auth:AuthContext,programId:string,input:AdjustLoyaltyInput){return this.database.withTenant(auth,async(client)=>{const program=await this.program(client,auth,programId);
    if(!(await client.query("SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL",[input.patientId])).rows[0])throw bad("PATIENT_NOT_FOUND","Patient not found");
    const account=await this.account(client,auth,program,input.patientId);const previous=await this.transactionByKey(client,account,input.idempotencyKey);
    if(previous)return previous;try{const row=await this.insertTransaction(client,auth,program,account,null,"adjustment",input.points,"manual",null,input.reason,
      input.idempotencyKey);await this.record(client,auth,"loyalty.adjusted","LoyaltyAdjusted","bonus_transaction",String(row.id),
      {patientId:input.patientId,points:input.points,reason:input.reason},program.organizationId);return row;}catch(error){if(isCheckViolation(error))
      throw conflict("INSUFFICIENT_BONUS_BALANCE","Bonus adjustment would make the balance negative");throw error;}});}

  redeem(auth:AuthContext,programId:string,input:RedeemLoyaltyInput){return this.database.withTenant(auth,async(client)=>{const program=await this.program(client,auth,programId);
    const charge=(await client.query<{patientId:string;organizationId:string;currency:string;totalAmountMinor:string}>(`SELECT c.patient_id AS "patientId",
      b.organization_id AS "organizationId",c.currency,c.total_amount_minor::text AS "totalAmountMinor" FROM charges c JOIN branches b ON b.id=c.branch_id
      WHERE c.id=$1`,[input.chargeId])).rows[0];if(!charge || charge.organizationId!==program.organizationId)throw bad("LOYALTY_CHARGE_SCOPE_MISMATCH",
      "Charge is outside the loyalty program organization");if(charge.currency!==program.currency)throw bad("LOYALTY_CURRENCY_MISMATCH","Charge currency does not match loyalty program");
    const maximum=Math.floor(Number(charge.totalAmountMinor)*program.maxRedemptionBps/10_000);if(input.points>maximum)throw bad("LOYALTY_REDEMPTION_LIMIT_EXCEEDED",
      "Requested points exceed the program redemption limit");const account=await this.account(client,auth,program,charge.patientId);
    const previous=await this.transactionByKey(client,account,input.idempotencyKey);if(previous)return previous;try{const row=await this.insertTransaction(client,auth,
      program,account,program.ruleId,"redeem",-input.points,"charge",input.chargeId,"Points redeemed against charge",input.idempotencyKey);
      await this.record(client,auth,"loyalty.points_redeemed","LoyaltyPointsRedeemed","bonus_transaction",String(row.id),
        {patientId:charge.patientId,chargeId:input.chargeId,points:input.points},program.organizationId);return row;}catch(error){if(isCheckViolation(error))
        throw conflict("INSUFFICIENT_BONUS_BALANCE","Bonus balance is insufficient");throw error;}});}

  balance(auth:AuthContext,programId:string,patientId:string){return this.database.withTenant(auth,async(client)=>{const program=await this.program(client,auth,programId);
    const row=(await client.query<{accountId:string|null;balance:string}>(`SELECT a.id AS "accountId",COALESCE(sum(t.points),0)::text AS balance
      FROM bonus_accounts a LEFT JOIN bonus_transactions t ON t.bonus_account_id=a.id WHERE a.program_id=$1 AND a.patient_id=$2 GROUP BY a.id`,
      [programId,patientId])).rows[0];return {programId,patientId,currency:program.currency,accountId:row?.accountId ?? null,balance:Number(row?.balance ?? 0)};});}

  createPromotion(auth:AuthContext,input:CreatePromotionInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);const services=[...new Set(input.serviceIds)];if(services.length){const count=(await client.query<{
      count:number}>("SELECT count(*)::int AS count FROM services WHERE id=ANY($1::uuid[]) AND organization_id=$2 AND active",[services,input.organizationId])).rows[0]!.count;
      if(count!==services.length)throw bad("PROMOTION_SERVICE_SCOPE_MISMATCH","One or more services are outside the organization");}
    const row=(await client.query<{id:string}>(`INSERT INTO promotions(tenant_id,organization_id,code,name,discount_type,discount_value,valid_from,
      valid_to,usage_limit,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[auth.tenantId,input.organizationId,input.code,
      input.name,input.discountType,input.discountValue,input.validFrom,input.validTo,input.usageLimit ?? null,auth.userId])).rows[0]!;
    for(const serviceId of services)await client.query(`INSERT INTO promotion_services(tenant_id,organization_id,promotion_id,service_id)
      VALUES($1,$2,$3,$4)`,[auth.tenantId,input.organizationId,row.id,serviceId]);const result={id:row.id,...input};await this.record(client,auth,
      "promotion.created","PromotionCreated","promotion",row.id,result,input.organizationId);return result;});}

  createCoupon(auth:AuthContext,input:CreateCouponInput){return this.database.withTenant(auth,async(client)=>{const promotion=(await client.query<{
    organizationId:string}>(`SELECT organization_id AS "organizationId" FROM promotions WHERE id=$1 AND active`,[input.promotionId])).rows[0];
    if(!promotion)throw notFound("PROMOTION_NOT_FOUND","Promotion not found");await assertOrganizationAccess(client,auth,promotion.organizationId,false);
    if(input.patientId && !(await client.query("SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL",[input.patientId])).rows[0])throw bad("PATIENT_NOT_FOUND","Patient not found");
    const row=(await client.query<{id:string}&Record<string,unknown>>(`INSERT INTO coupons(tenant_id,organization_id,promotion_id,code,patient_id,expires_at,
      max_uses,created_by) VALUES($1,$2,$3,upper($4),$5,$6,$7,$8) RETURNING id,promotion_id AS "promotionId",code,patient_id AS "patientId",
      expires_at AS "expiresAt",max_uses AS "maxUses",active`,[auth.tenantId,promotion.organizationId,input.promotionId,input.code,input.patientId ?? null,
      input.expiresAt ?? null,input.maxUses,auth.userId])).rows[0]!;await this.record(client,auth,"coupon.created","CouponCreated","coupon",row.id,row,
      promotion.organizationId);return row;});}

  quote(auth:AuthContext,input:QuotePromotionInput){return this.database.withTenant(auth,async(client)=>{await assertOrganizationAccess(client,auth,input.organizationId,false);
    return this.quoteInternal(client,input,false);});}

  redeemPromotion(auth:AuthContext,input:RedeemPromotionInput){return this.database.withTenant(auth,async(client)=>{await assertOrganizationAccess(client,auth,
    input.organizationId,false);const previous=(await client.query(`SELECT id,promotion_id AS "promotionId",coupon_id AS "couponId",gross_amount_minor::text AS "grossAmountMinor",
      discount_amount_minor::text AS "discountAmountMinor",redeemed_at AS "redeemedAt" FROM promotion_redemptions WHERE organization_id=$1 AND idempotency_key=$2`,
      [input.organizationId,input.idempotencyKey])).rows[0];if(previous)return money(previous);
    if(input.couponCode)await client.query("SELECT id FROM coupons WHERE organization_id=$1 AND upper(code)=upper($2) FOR UPDATE",
      [input.organizationId,input.couponCode]);const quote=await this.quoteInternal(client,input,true);
    const usage=(await client.query<{limit:number|null;used:number}>(`SELECT usage_limit AS "limit",
      (SELECT count(*)::int FROM promotion_redemptions r WHERE r.promotion_id=p.id) AS used FROM promotions p WHERE p.id=$1`,[quote.promotionId])).rows[0]!;
    if(usage.limit!==null && usage.used>=usage.limit)throw conflict("PROMOTION_USAGE_LIMIT_REACHED","Promotion usage limit has been reached");
    const row=(await client.query(`INSERT INTO promotion_redemptions(tenant_id,organization_id,promotion_id,coupon_id,patient_id,service_id,
      gross_amount_minor,discount_amount_minor,reference_type,reference_id,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id,promotion_id AS "promotionId",coupon_id AS "couponId",gross_amount_minor::text AS "grossAmountMinor",
      discount_amount_minor::text AS "discountAmountMinor",redeemed_at AS "redeemedAt"`,[auth.tenantId,input.organizationId,quote.promotionId,
      quote.couponId,input.patientId ?? null,input.serviceId ?? null,input.grossAmountMinor,quote.discountAmountMinor,input.referenceType,input.referenceId,
      input.idempotencyKey,auth.userId])).rows[0]!;await this.record(client,auth,"promotion.redeemed","PromotionRedeemed","promotion_redemption",
      String(row.id),{...money(row),referenceType:input.referenceType,referenceId:input.referenceId},input.organizationId);return money(row);});}

  private async quoteInternal(client:PoolClient,input:QuotePromotionInput,lock:boolean):Promise<PromotionQuote>{const at=input.at ?? new Date().toISOString();
    const rows=(await client.query<{promotionId:string;discountType:string;discountValue:string;usageLimit:number|null;couponId:string|null}>(
      `SELECT p.id AS "promotionId",p.discount_type AS "discountType",p.discount_value::text AS "discountValue",p.usage_limit AS "usageLimit",c.id AS "couponId"
       FROM promotions p LEFT JOIN coupons c ON c.promotion_id=p.id AND upper(c.code)=upper($2::text)
       WHERE p.organization_id=$1 AND p.active AND p.valid_from<=$3 AND p.valid_to>$3
       AND ($2::text IS NULL OR (c.id IS NOT NULL AND c.active AND (c.expires_at IS NULL OR c.expires_at>$3)
         AND (c.patient_id IS NULL OR c.patient_id=$4::uuid) AND (SELECT count(*) FROM promotion_redemptions x WHERE x.coupon_id=c.id)<c.max_uses))
       AND (NOT EXISTS(SELECT 1 FROM promotion_services s WHERE s.promotion_id=p.id) OR EXISTS(
         SELECT 1 FROM promotion_services s WHERE s.promotion_id=p.id AND s.service_id=$5::uuid))
       AND (p.usage_limit IS NULL OR (SELECT count(*) FROM promotion_redemptions x WHERE x.promotion_id=p.id)<p.usage_limit)
       ORDER BY p.id${lock?" FOR UPDATE OF p":""}`,[input.organizationId,input.couponCode ?? null,at,input.patientId ?? null,input.serviceId ?? null])).rows;
    if(input.couponCode && !rows.length)throw conflict("COUPON_UNAVAILABLE","Coupon is invalid, expired, exhausted, or outside the requested scope");
    if(!rows.length)throw notFound("PROMOTION_NOT_FOUND","No applicable promotion found");let best:PromotionQuote|null=null;
    for(const row of rows){const raw=row.discountType==="percentage"?Math.floor(input.grossAmountMinor*Number(row.discountValue)/10_000):Number(row.discountValue);
      const discount=Math.min(input.grossAmountMinor,raw);if(!best || discount>best.discountAmountMinor)best={promotionId:row.promotionId,couponId:row.couponId,
        discountAmountMinor:discount,grossAmountMinor:input.grossAmountMinor,netAmountMinor:input.grossAmountMinor-discount};}return best!;}
  private async program(client:PoolClient,auth:AuthContext,id:string){const row=(await client.query<ProgramRow>(`SELECT p.id,p.organization_id AS "organizationId",p.currency,
    r.id AS "ruleId",r.earning_rate_bps AS "earningRateBps",r.max_redemption_bps AS "maxRedemptionBps" FROM loyalty_programs p
    JOIN loyalty_rules r ON r.program_id=p.id AND r.version_number=p.current_rule_version WHERE p.id=$1 AND p.active
    AND r.valid_from<=current_date AND COALESCE(r.valid_to,'infinity'::date)>=current_date`,[id])).rows[0];if(!row)throw notFound("LOYALTY_PROGRAM_NOT_FOUND",
    "Active loyalty program not found");await assertOrganizationAccess(client,auth,row.organizationId,false);return row;}
  private async account(client:PoolClient,auth:AuthContext,program:ProgramRow,patientId:string){return (await client.query<{id:string}>(`INSERT INTO bonus_accounts
    (tenant_id,organization_id,program_id,patient_id) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,program_id,patient_id) DO UPDATE SET status=bonus_accounts.status
    RETURNING id`,[auth.tenantId,program.organizationId,program.id,patientId])).rows[0]!.id;}
  private transactionByKey(client:PoolClient,accountId:string,key:string){return client.query(`SELECT id,points::text AS points,transaction_type AS "transactionType",
    source_type AS "sourceType",source_id AS "sourceId",reason,occurred_at AS "occurredAt" FROM bonus_transactions WHERE bonus_account_id=$1 AND idempotency_key=$2`,
    [accountId,key]).then((result)=>result.rows[0]?money(result.rows[0]):undefined);}
  private async insertTransaction(client:PoolClient,auth:AuthContext,program:ProgramRow,accountId:string,ruleId:string|null,type:string,points:number,
    sourceType:string,sourceId:string|null,reason:string,key:string){const row=(await client.query(`INSERT INTO bonus_transactions(tenant_id,organization_id,
      bonus_account_id,rule_id,transaction_type,points,source_type,source_id,reason,idempotency_key,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,points::text AS points,transaction_type AS "transactionType",
      source_type AS "sourceType",source_id AS "sourceId",reason,occurred_at AS "occurredAt"`,[auth.tenantId,program.organizationId,accountId,
      ruleId,type,points,sourceType,sourceId,reason,key,auth.userId])).rows[0]!;return money(row);}
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,entityType:string,id:string,after:unknown,organizationId:string){
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType,entityId:id,after,requestId:auth.requestId});
    await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,aggregateId:id,eventType,payload:{entityId:id,organizationId},requestId:auth.requestId});}
}
function money<T extends Record<string,unknown>>(row:T){for(const key of ["points","grossAmountMinor","discountAmountMinor"])if(typeof row[key]==="string")
  (row as Record<string,unknown>)[key]=Number(row[key]);return row;}
function isCheckViolation(error:unknown){return typeof error==="object" && error!==null && "code" in error && String(error.code)==="23514";}
function bad(code:string,message:string){return new ApiException(HttpStatus.BAD_REQUEST,code,message);}
function conflict(code:string,message:string){return new ApiException(HttpStatus.CONFLICT,code,message);}
function notFound(code:string,message:string){return new ApiException(HttpStatus.NOT_FOUND,code,message);}
