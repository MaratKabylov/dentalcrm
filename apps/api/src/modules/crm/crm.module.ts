import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { CrmController } from "./crm.controller.js";
import { CrmService } from "./crm.service.js";

@Module({ imports:[AuditModule,OutboxModule],controllers:[CrmController],providers:[CrmService] })
export class CrmModule {}
