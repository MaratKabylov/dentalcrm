import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { OrganizationsController } from "./organizations.controller.js";
import { OrganizationsRepository } from "./organizations.repository.js";
import { OrganizationsService } from "./organizations.service.js";

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsRepository, OrganizationsService]
})
export class OrganizationsModule {}
