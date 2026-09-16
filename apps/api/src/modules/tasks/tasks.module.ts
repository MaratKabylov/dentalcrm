import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";

@Module({imports:[AuditModule,OutboxModule],controllers:[TasksController],providers:[TasksService]})
export class TasksModule {}
