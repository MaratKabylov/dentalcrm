import type { CreateOrganizationInput, OrganizationDto } from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthContext } from "../identity/auth-context.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { OrganizationsRepository } from "./organizations.repository.js";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: OrganizationsRepository,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService
  ) {}

  list(auth: AuthContext): Promise<OrganizationDto[]> {
    return this.repository.list(auth.tenantId);
  }

  async create(auth: AuthContext, input: CreateOrganizationInput): Promise<OrganizationDto> {
    try {
      return await this.database.withTenant(auth, async (client) => {
        const organization = await this.repository.insert(client, {
          tenantId: auth.tenantId,
          userId: auth.userId,
          ...input
        });
        await this.audit.append(client, {
          tenantId: auth.tenantId,
          actorUserId: auth.userId,
          action: "organization.created",
          entityType: "organization",
          entityId: organization.id,
          after: organization,
          requestId: auth.requestId
        });
        await this.outbox.append(client, {
          tenantId: auth.tenantId,
          aggregateType: "organization",
          aggregateId: organization.id,
          eventType: "OrganizationCreated",
          payload: { organizationId: organization.id, code: organization.code },
          requestId: auth.requestId
        });
        return organization;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "ORGANIZATION_CODE_CONFLICT",
          "Organization code already exists in this tenant"
        );
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
