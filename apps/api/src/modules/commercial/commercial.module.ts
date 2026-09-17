import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { InsuranceController, LaboratoryController, LoyaltyController } from "./commercial.controller.js";
import { InsuranceService } from "./insurance.service.js";
import { LaboratoryService } from "./laboratory.service.js";
import { LoyaltyService } from "./loyalty.service.js";

@Module({imports:[AuditModule,OutboxModule],controllers:[LaboratoryController,InsuranceController,LoyaltyController],
  providers:[LaboratoryService,InsuranceService,LoyaltyService]})
export class CommercialModule {}

