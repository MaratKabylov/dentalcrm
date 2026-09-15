import { ForbiddenException } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { AuthContext } from "./auth-context.js";

export function scopeValues(auth: AuthContext): [string[], string[]] {
  return [[...auth.organizationIds], [...auth.branchIds]];
}

export function organizationScopeSql(alias: string, organizationParam = 1, branchParam = 2): string {
  return `(${alias}.organization_id=ANY($${organizationParam}::uuid[]) OR EXISTS (
    SELECT 1 FROM branches access_branch
    WHERE access_branch.tenant_id=${alias}.tenant_id AND access_branch.organization_id=${alias}.organization_id
      AND access_branch.id=ANY($${branchParam}::uuid[])
  ))`;
}

export function branchScopeSql(alias: string, organizationParam = 1, branchParam = 2): string {
  return `(${alias}.organization_id=ANY($${organizationParam}::uuid[]) OR ${alias}.id=ANY($${branchParam}::uuid[]))`;
}

export async function assertOrganizationAccess(client: PoolClient, auth: AuthContext, organizationId: string,
  includeBranchScopes = true): Promise<void> {
  if (auth.tenantWide || auth.organizationIds.has(organizationId)) return;
  const branchIds = [...auth.branchIds];
  const allowed = includeBranchScopes && branchIds.length > 0 && (await client.query(
    `SELECT 1 FROM branches WHERE organization_id=$1 AND id=ANY($2::uuid[]) LIMIT 1`,
    [organizationId, branchIds]
  )).rows[0];
  if (!allowed) throw new ForbiddenException("Organization is outside the membership access scope");
}

export async function assertBranchAccess(client: PoolClient, auth: AuthContext, branchId: string): Promise<string> {
  const row = (await client.query<{ organizationId: string }>(
    `SELECT organization_id AS "organizationId" FROM branches WHERE id=$1 AND archived_at IS NULL`,
    [branchId]
  )).rows[0];
  if (!row) throw new ForbiddenException("Branch is outside the membership access scope");
  if (!auth.tenantWide && !auth.organizationIds.has(row.organizationId) && !auth.branchIds.has(branchId)) {
    throw new ForbiddenException("Branch is outside the membership access scope");
  }
  return row.organizationId;
}
