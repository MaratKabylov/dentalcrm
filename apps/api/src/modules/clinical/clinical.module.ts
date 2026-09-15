import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { ClinicalController } from "./clinical.controller.js";
import { ClinicalService } from "./clinical.service.js";

@Module({ imports: [AuditModule, OutboxModule], controllers: [ClinicalController], providers: [ClinicalService] })
export class ClinicalModule {}
