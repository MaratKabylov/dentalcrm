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

  update(auth: AuthContext, id: string, input: { name: string }): Promise<OrganizationDto> {
    return this.database.withTenant(auth, async (client) => {
      const before = await this.repository.findForUpdate(client, id);
      if (!before) throw new ApiException(HttpStatus.NOT_FOUND, "ORGANIZATION_NOT_FOUND", "Organization not found");
      const row = (await client.query<{ id: string; name: string; code: string; created_at: Date }>(`UPDATE organizations
        SET name=$2,updated_at=now(),updated_by=$3,version=version+1 WHERE id=$1
        RETURNING id,name,code,created_at`, [id, input.name, auth.userId])).rows[0]!;
      const after = { id: row.id, name: row.name, code: row.code, createdAt: row.created_at.toISOString() };
      await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action: "organization.updated",
        entityType: "organization", entityId: id, before, after, requestId: auth.requestId });
      await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: "organization", aggregateId: id,
        eventType: "OrganizationUpdated", payload: { organizationId: id }, requestId: auth.requestId });
      return after;
    });
  }

  archive(auth: AuthContext, id: string) {
    return this.database.withTenant(auth, async (client) => {
      const before = await this.repository.findForUpdate(client, id);
      if (!before) throw new ApiException(HttpStatus.NOT_FOUND, "ORGANIZATION_NOT_FOUND", "Organization not found");
      const activeBranches = await client.query("SELECT 1 FROM branches WHERE organization_id=$1 AND archived_at IS NULL LIMIT 1", [id]);
      if (activeBranches.rows[0]) throw new ApiException(HttpStatus.CONFLICT, "ORGANIZATION_HAS_BRANCHES",
        "Archive the organization's branches first");
      await client.query(`UPDATE organizations SET archived_at=now(),archived_by=$2,updated_at=now(),updated_by=$2,
        version=version+1 WHERE id=$1`, [id, auth.userId]);
      await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action: "organization.archived",
        entityType: "organization", entityId: id, before, after: { archived: true }, requestId: auth.requestId });
      await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: "organization", aggregateId: id,
        eventType: "OrganizationArchived", payload: { organizationId: id }, requestId: auth.requestId });
      return { id, archived: true };
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
