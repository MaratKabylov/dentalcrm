import { analyticsRangeSchema,createMarketingAttributionSchema,createMarketingCampaignSchema,
  recordMarketingSpendSchema,uuidSchema } from "@dental/contracts";
import { Body,Controller,Get,Param,Post,Query } from "@nestjs/common";
import { ApiBearerAuth,ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { AnalyticsService } from "./analytics.service.js";

@ApiTags("analytics") @ApiBearerAuth() @Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics:AnalyticsService){}

  @Get("treatment-acceptance") @RequirePermissions("analytics.read")
  treatmentAcceptance(@CurrentAuth() auth:AuthContext,@Query() query:unknown){
    return this.analytics.treatmentAcceptance(auth,parseSchema(analyticsRangeSchema,query));}
  @Get("chair-economics") @RequirePermissions("analytics.financial.read")
  chairEconomics(@CurrentAuth() auth:AuthContext,@Query() query:unknown){
    return this.analytics.chairEconomics(auth,parseSchema(analyticsRangeSchema,query));}
  @Get("contribution-margin") @RequirePermissions("analytics.financial.read")
  contributionMargin(@CurrentAuth() auth:AuthContext,@Query() query:unknown){
    return this.analytics.contributionMargin(auth,parseSchema(analyticsRangeSchema,query));}
  @Get("marketing-attribution") @RequirePermissions("analytics.financial.read")
  marketingAttribution(@CurrentAuth() auth:AuthContext,@Query() query:unknown){
    return this.analytics.marketingAttribution(auth,parseSchema(analyticsRangeSchema,query));}
  @Get("roas") @RequirePermissions("analytics.financial.read")
  roas(@CurrentAuth() auth:AuthContext,@Query() query:unknown){
    return this.analytics.roas(auth,parseSchema(analyticsRangeSchema,query));}
  @Get("inventory") @RequirePermissions("analytics.read")
  inventory(@CurrentAuth() auth:AuthContext,@Query() query:unknown){
    return this.analytics.inventory(auth,parseSchema(analyticsRangeSchema,query));}

  @Post("marketing/campaigns") @RequirePermissions("analytics.marketing.manage")
  createCampaign(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.analytics.createCampaign(auth,parseSchema(createMarketingCampaignSchema,body));}
  @Post("marketing/campaigns/:id/spend") @RequirePermissions("analytics.marketing.manage")
  recordSpend(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){
    return this.analytics.recordSpend(auth,parseSchema(uuidSchema,id),parseSchema(recordMarketingSpendSchema,body));}
  @Post("marketing/attributions") @RequirePermissions("analytics.marketing.manage")
  attribute(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.analytics.createAttribution(auth,parseSchema(createMarketingAttributionSchema,body));}
}
