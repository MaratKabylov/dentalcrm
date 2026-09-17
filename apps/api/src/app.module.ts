import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { requestIdMiddleware } from "./common/http/request-id.middleware.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { AuthGuard } from "./modules/identity/auth.guard.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { PermissionsGuard } from "./modules/identity/permissions.guard.js";
import { OrganizationsModule } from "./modules/organizations/organizations.module.js";
import { ClinicModule } from "./modules/clinic/clinic.module.js";
import { PatientsModule } from "./modules/patients/patients.module.js";
import { SchedulingModule } from "./modules/scheduling/scheduling.module.js";
import { ClinicalModule } from "./modules/clinical/clinical.module.js";
import { DocumentsModule } from "./modules/documents/documents.module.js";
import { TreatmentPlansModule } from "./modules/treatment-plans/treatment-plans.module.js";
import { FinanceModule } from "./modules/finance/finance.module.js";
import { CrmModule } from "./modules/crm/crm.module.js";
import { TasksModule } from "./modules/tasks/tasks.module.js";
import { WorkflowModule } from "./modules/workflow/workflow.module.js";
import { EngagementModule } from "./modules/engagement/engagement.module.js";
import { InventoryModule } from "./modules/inventory/inventory.module.js";
import { CompensationModule } from "./modules/compensation/compensation.module.js";
import { ExperienceModule } from "./modules/experience/experience.module.js";
import { CommercialModule } from "./modules/commercial/commercial.module.js";
import { AnalyticsModule } from "./modules/analytics/analytics.module.js";
import { AdministrationModule } from "./modules/administration/administration.module.js";

@Module({
  imports: [DatabaseModule, IdentityModule, HealthModule, OrganizationsModule, ClinicModule, PatientsModule, SchedulingModule,
    ClinicalModule, TreatmentPlansModule, DocumentsModule, FinanceModule, CrmModule, TasksModule, WorkflowModule, EngagementModule, InventoryModule,
    CompensationModule, ExperienceModule, CommercialModule, AnalyticsModule, AdministrationModule],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestIdMiddleware).forRoutes("{*path}");
  }
}
