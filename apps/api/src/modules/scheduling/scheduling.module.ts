import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { SchedulingController } from "./scheduling.controller.js";
import { SchedulingService } from "./scheduling.service.js";

@Module({ imports: [AuditModule, OutboxModule], controllers: [SchedulingController], providers: [SchedulingService] })
export class SchedulingModule {}
