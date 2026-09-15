import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";

@Module({ imports: [AuditModule, OutboxModule], controllers: [DocumentsController], providers: [DocumentsService] })
export class DocumentsModule {}
