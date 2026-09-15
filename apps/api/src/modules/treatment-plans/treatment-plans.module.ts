import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { TreatmentPlansController } from "./treatment-plans.controller.js";
import { TreatmentPlansService } from "./treatment-plans.service.js";

@Module({ imports: [AuditModule, OutboxModule], controllers: [TreatmentPlansController], providers: [TreatmentPlansService] })
export class TreatmentPlansModule {}
