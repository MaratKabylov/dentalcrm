import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { FinanceController } from "./finance.controller.js";
import { FinanceService } from "./finance.service.js";

@Module({ imports: [AuditModule, OutboxModule], controllers: [FinanceController], providers: [FinanceService] })
export class FinanceModule {}
