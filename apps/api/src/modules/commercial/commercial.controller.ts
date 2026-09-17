import { addLabCaseFileSchema,adjustLoyaltySchema,adjudicateInsuranceClaimSchema,awardLoyaltySchema,createCouponSchema,
  createInsuranceClaimSchema,createInsuranceCompanySchema,createInsurancePlanSchema,createInsurancePriceListSchema,createLabCaseSchema,
  createLaboratorySchema,createLoyaltyProgramSchema,createPatientPolicySchema,createPromotionSchema,quotePromotionSchema,recordInsurancePaymentSchema,
  recordLabInvoiceSchema,redeemLoyaltySchema,redeemPromotionSchema,transitionLabCaseSchema,uuidSchema } from "@dental/contracts";
import { Body,Controller,Get,Param,Post,Query } from "@nestjs/common";
import { ApiBearerAuth,ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { InsuranceService } from "./insurance.service.js";
import { LaboratoryService } from "./laboratory.service.js";
import { LoyaltyService } from "./loyalty.service.js";

@ApiTags("laboratory") @ApiBearerAuth() @Controller("laboratory")
export class LaboratoryController {
  constructor(private readonly laboratory:LaboratoryService){}
  @Post("laboratories") @RequirePermissions("laboratory.manage") createLaboratory(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.laboratory.createLaboratory(auth,parseSchema(createLaboratorySchema,body));}
  @Get("cases") @RequirePermissions("laboratory.read") cases(@CurrentAuth() auth:AuthContext,@Query("status") status?:string){
    return this.laboratory.listCases(auth,status);}
  @Post("cases") @RequirePermissions("laboratory.manage") createCase(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.laboratory.createCase(auth,parseSchema(createLabCaseSchema,body));}
  @Get("cases/:id") @RequirePermissions("laboratory.read") case(@CurrentAuth() auth:AuthContext,@Param("id") id:string){
    return this.laboratory.getCase(auth,parseSchema(uuidSchema,id));}
  @Post("cases/:id/transition") @RequirePermissions("laboratory.manage") transition(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){
    return this.laboratory.transition(auth,parseSchema(uuidSchema,id),parseSchema(transitionLabCaseSchema,body));}
  @Post("cases/:id/files") @RequirePermissions("laboratory.manage") file(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){
    return this.laboratory.addFile(auth,parseSchema(uuidSchema,id),parseSchema(addLabCaseFileSchema,body));}
  @Post("cases/:id/invoices") @RequirePermissions("laboratory.manage") invoice(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){
    return this.laboratory.recordInvoice(auth,parseSchema(uuidSchema,id),parseSchema(recordLabInvoiceSchema,body));}
}

@ApiTags("insurance") @ApiBearerAuth() @Controller("insurance")
export class InsuranceController {
  constructor(private readonly insurance:InsuranceService){}
  @Post("companies") @RequirePermissions("insurance.manage") company(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.insurance.createCompany(auth,parseSchema(createInsuranceCompanySchema,body));}
  @Post("plans") @RequirePermissions("insurance.manage") plan(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.insurance.createPlan(auth,parseSchema(createInsurancePlanSchema,body));}
  @Post("price-lists") @RequirePermissions("insurance.manage") priceList(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.insurance.createPriceList(auth,parseSchema(createInsurancePriceListSchema,body));}
  @Post("policies") @RequirePermissions("insurance.manage") policy(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.insurance.createPolicy(auth,parseSchema(createPatientPolicySchema,body));}
  @Get("claims") @RequirePermissions("insurance.read") claims(@CurrentAuth() auth:AuthContext,@Query("status") status?:string){
    return this.insurance.listClaims(auth,status);}
  @Post("claims") @RequirePermissions("insurance.manage") claim(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.insurance.createClaim(auth,parseSchema(createInsuranceClaimSchema,body));}
  @Get("claims/:id") @RequirePermissions("insurance.read") getClaim(@CurrentAuth() auth:AuthContext,@Param("id") id:string){
    return this.insurance.getClaim(auth,parseSchema(uuidSchema,id));}
  @Post("claims/:id/submit") @RequirePermissions("insurance.adjudicate") submit(@CurrentAuth() auth:AuthContext,@Param("id") id:string){
    return this.insurance.submitClaim(auth,parseSchema(uuidSchema,id));}
  @Post("claims/:id/adjudicate") @RequirePermissions("insurance.adjudicate") adjudicate(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){
    return this.insurance.adjudicate(auth,parseSchema(uuidSchema,id),parseSchema(adjudicateInsuranceClaimSchema,body));}
  @Post("claims/:id/payments") @RequirePermissions("insurance.adjudicate") payment(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){
    return this.insurance.recordPayment(auth,parseSchema(uuidSchema,id),parseSchema(recordInsurancePaymentSchema,body));}
}

@ApiTags("loyalty-promotions") @ApiBearerAuth() @Controller("loyalty")
export class LoyaltyController {
  constructor(private readonly loyalty:LoyaltyService){}
  @Post("programs") @RequirePermissions("loyalty.manage") program(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.loyalty.createProgram(auth,parseSchema(createLoyaltyProgramSchema,body));}
  @Post("programs/:id/award") @RequirePermissions("loyalty.adjust") award(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){
    return this.loyalty.award(auth,parseSchema(uuidSchema,id),parseSchema(awardLoyaltySchema,body));}
  @Post("programs/:id/adjust") @RequirePermissions("loyalty.adjust") adjust(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){
    return this.loyalty.adjust(auth,parseSchema(uuidSchema,id),parseSchema(adjustLoyaltySchema,body));}
  @Post("programs/:id/redeem") @RequirePermissions("loyalty.adjust") redeem(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){
    return this.loyalty.redeem(auth,parseSchema(uuidSchema,id),parseSchema(redeemLoyaltySchema,body));}
  @Get("programs/:id/patients/:patientId/balance") @RequirePermissions("loyalty.read") balance(@CurrentAuth() auth:AuthContext,@Param("id") id:string,
    @Param("patientId") patientId:string){return this.loyalty.balance(auth,parseSchema(uuidSchema,id),parseSchema(uuidSchema,patientId));}
  @Post("promotions") @RequirePermissions("loyalty.manage") promotion(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.loyalty.createPromotion(auth,parseSchema(createPromotionSchema,body));}
  @Post("coupons") @RequirePermissions("loyalty.manage") coupon(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.loyalty.createCoupon(auth,parseSchema(createCouponSchema,body));}
  @Post("promotions/quote") @RequirePermissions("loyalty.read") quote(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.loyalty.quote(auth,parseSchema(quotePromotionSchema,body));}
  @Post("promotions/redeem") @RequirePermissions("loyalty.adjust") redeemPromotion(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.loyalty.redeemPromotion(auth,parseSchema(redeemPromotionSchema,body));}
}

