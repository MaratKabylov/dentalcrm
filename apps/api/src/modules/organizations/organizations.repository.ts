import type { OrganizationDto } from "@dental/contracts";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthContext } from "../identity/auth-context.js";
import { organizationScopeSql, scopeValues } from "../identity/access-scope.js";

interface OrganizationRow {
  id: string;
  name: string;
  code: string;
  created_at: Date;
}

@Injectable()
export class OrganizationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(auth: AuthContext): Promise<OrganizationDto[]> {
    return this.database.withTenant(auth, async (client) => {
      const result = await client.query<OrganizationRow>(
        `SELECT id, name, code, created_at
         FROM organizations o
         WHERE archived_at IS NULL AND ${auth.tenantWide ? "TRUE" : organizationScopeSql("o")}
         ORDER BY name`,
        auth.tenantWide ? [] : scopeValues(auth)
      );
      return result.rows.map(toDto);
    });
  }

  async insert(client: PoolClient, values: {
    tenantId: string;
    userId: string;
    name: string;
    code: string;
  }): Promise<OrganizationDto> {
    const result = await client.query<OrganizationRow>(
      `INSERT INTO organizations (tenant_id, name, code, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING id, name, code, created_at`,
      [values.tenantId, values.name, values.code, values.userId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Organization insert returned no row");
    return toDto(row);
  }

  async findForUpdate(client: PoolClient, id: string): Promise<OrganizationDto | undefined> {
    const row = (await client.query<OrganizationRow>(`SELECT id,name,code,created_at FROM organizations
      WHERE id=$1 AND archived_at IS NULL FOR UPDATE`, [id])).rows[0];
    return row ? toDto(row) : undefined;
  }
}

function toDto(row: OrganizationRow): OrganizationDto {
  return { id: row.id, name: row.name, code: row.code, createdAt: row.created_at.toISOString() };
}
