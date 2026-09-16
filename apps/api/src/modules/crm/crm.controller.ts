import {
  createCrmActivitySchema,createCrmCatalogItemSchema,createLeadSchema,createOpportunitySchema,
  createOpportunityStageSchema,convertLeadSchema,linkOpportunityPlanSchema,loseLeadSchema,
  transitionOpportunitySchema,updateLeadSchema,uuidSchema
} from "@dental/contracts";
import { Body,Controller,Get,Param,Patch,Post,Query } from "@nestjs/common";
import { ApiBearerAuth,ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { CrmService } from "./crm.service.js";

@ApiTags("crm") @ApiBearerAuth() @Controller()
export class CrmController {
  constructor(private readonly crm:CrmService){}

  @Get("crm/lead-sources") @RequirePermissions("crm.read")
  sources(@CurrentAuth() auth:AuthContext){return this.crm.listCatalog(auth,"lead_sources");}
  @Post("crm/lead-sources") @RequirePermissions("crm.manage")
  createSource(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.crm.createCatalog(auth,"lead_sources",parseSchema(createCrmCatalogItemSchema,body));}

  @Get("crm/lead-channels") @RequirePermissions("crm.read")
  channels(@CurrentAuth() auth:AuthContext){return this.crm.listCatalog(auth,"lead_channels");}
  @Post("crm/lead-channels") @RequirePermissions("crm.manage")
  createChannel(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.crm.createCatalog(auth,"lead_channels",parseSchema(createCrmCatalogItemSchema,body));}

  @Get("crm/opportunity-stages") @RequirePermissions("crm.read")
  stages(@CurrentAuth() auth:AuthContext,@Query("organizationId") organizationId?:string){return this.crm.listStages(auth,organizationId?parseSchema(uuidSchema,organizationId):undefined);}
  @Post("crm/opportunity-stages") @RequirePermissions("crm.manage")
  createStage(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.crm.createStage(auth,parseSchema(createOpportunityStageSchema,body));}

  @Get("leads") @RequirePermissions("crm.read")
  leads(@CurrentAuth() auth:AuthContext,@Query("status") status?:string,@Query("q") query?:string){return this.crm.listLeads(auth,status,query);}
  @Post("leads") @RequirePermissions("crm.manage")
  createLead(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.crm.createLead(auth,parseSchema(createLeadSchema,body));}
  @Get("leads/:id") @RequirePermissions("crm.read")
  getLead(@CurrentAuth() auth:AuthContext,@Param("id") id:string){return this.crm.getLead(auth,parseSchema(uuidSchema,id));}
  @Patch("leads/:id") @RequirePermissions("crm.manage")
  updateLead(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.crm.updateLead(auth,parseSchema(uuidSchema,id),parseSchema(updateLeadSchema,body));}
  @Post("leads/:id/convert") @RequirePermissions("crm.manage")
  convert(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.crm.convertLead(auth,parseSchema(uuidSchema,id),parseSchema(convertLeadSchema,body));}
  @Post("leads/:id/lose") @RequirePermissions("crm.manage")
  lose(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.crm.loseLead(auth,parseSchema(uuidSchema,id),parseSchema(loseLeadSchema,body).reason);}

  @Get("opportunities") @RequirePermissions("crm.read")
  opportunities(@CurrentAuth() auth:AuthContext,@Query("stageId") stageId?:string){return this.crm.listOpportunities(auth,stageId?parseSchema(uuidSchema,stageId):undefined);}
  @Post("opportunities") @RequirePermissions("crm.manage")
  createOpportunity(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.crm.createOpportunity(auth,parseSchema(createOpportunitySchema,body));}
  @Get("opportunities/:id") @RequirePermissions("crm.read")
  getOpportunity(@CurrentAuth() auth:AuthContext,@Param("id") id:string){return this.crm.getOpportunity(auth,parseSchema(uuidSchema,id));}
  @Post("opportunities/:id/stage") @RequirePermissions("crm.manage")
  transition(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.crm.transitionOpportunity(auth,parseSchema(uuidSchema,id),parseSchema(transitionOpportunitySchema,body));}
  @Post("opportunities/:id/treatment-plan") @RequirePermissions("crm.manage")
  linkPlan(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown){return this.crm.linkTreatmentPlan(auth,parseSchema(uuidSchema,id),parseSchema(linkOpportunityPlanSchema,body).treatmentPlanId);}

  @Get("crm/activities") @RequirePermissions("crm.read")
  activities(@CurrentAuth() auth:AuthContext,@Query("leadId") leadId?:string,@Query("opportunityId") opportunityId?:string,
    @Query("patientId") patientId?:string){return this.crm.listActivities(auth,{...(leadId?{leadId}:{}),...(opportunityId?{opportunityId}:{}),
      ...(patientId?{patientId}:{})});}
  @Post("crm/activities") @RequirePermissions("crm.manage")
  createActivity(@CurrentAuth() auth:AuthContext,@Body() body:unknown){return this.crm.createActivity(auth,parseSchema(createCrmActivitySchema,body));}
}
