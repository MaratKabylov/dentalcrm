import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { ExperienceController, PortalController, PublicExperienceController } from "./experience.controller.js";
import { ExperienceService } from "./experience.service.js";

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [ExperienceController, PublicExperienceController, PortalController],
  providers: [ExperienceService]
})
export class ExperienceModule {}

