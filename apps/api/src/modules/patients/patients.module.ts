import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { PatientsController } from "./patients.controller.js";
import { PatientsService } from "./patients.service.js";

@Module({ imports: [AuditModule, OutboxModule], controllers: [PatientsController], providers: [PatientsService] })
export class PatientsModule {}
