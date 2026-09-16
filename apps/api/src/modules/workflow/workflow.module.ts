import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { WorkflowController } from "./workflow.controller.js";
import { WorkflowService } from "./workflow.service.js";

@Module({imports:[AuditModule,OutboxModule],controllers:[WorkflowController],providers:[WorkflowService]})
export class WorkflowModule {}
