import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AdministrationController } from "./administration.controller.js";
import { AdministrationService } from "./administration.service.js";

@Module({imports:[AuditModule],controllers:[AdministrationController],providers:[AdministrationService]})
export class AdministrationModule {}
