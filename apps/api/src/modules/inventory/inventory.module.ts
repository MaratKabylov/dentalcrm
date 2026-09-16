import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { InventoryController } from "./inventory.controller.js";
import { InventoryService } from "./inventory.service.js";

@Module({imports:[AuditModule,OutboxModule],controllers:[InventoryController],providers:[InventoryService]})
export class InventoryModule {}
