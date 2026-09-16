import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { CompensationController } from "./compensation.controller.js";
import { CompensationService } from "./compensation.service.js";

@Module({imports:[AuditModule,OutboxModule],controllers:[CompensationController],providers:[CompensationService]})
export class CompensationModule {}
