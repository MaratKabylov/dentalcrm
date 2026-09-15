import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { ClinicController } from "./clinic.controller.js";
import { ClinicService } from "./clinic.service.js";

@Module({ imports: [AuditModule, OutboxModule], controllers: [ClinicController], providers: [ClinicService] })
export class ClinicModule {}
