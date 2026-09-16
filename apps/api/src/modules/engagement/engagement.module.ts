import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { EngagementController } from "./engagement.controller.js";
import { EngagementService } from "./engagement.service.js";

@Module({ imports: [AuditModule, OutboxModule], controllers: [EngagementController], providers: [EngagementService] })
export class EngagementModule {}
