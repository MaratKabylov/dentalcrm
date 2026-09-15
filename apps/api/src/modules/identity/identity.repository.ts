import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";

interface MembershipRow {
  user_id: string;
  membership_id: string;
  permission_key: string | null;
}

interface AccessScopeRow {
  scope_type: "tenant" | "organization" | "branch";
  organization_id: string | null;
  branch_id: string | null;
}

@Injectable()
export class IdentityRepository {
  constructor(private readonly database: DatabaseService) {}

  async resolveMembership(tenantId: string, subject: string): Promise<{
    userId: string;
    membershipId: string;
    permissions: Set<string>;
    tenantWide: boolean;
    organizationIds: Set<string>;
    branchIds: Set<string>;
  } | null> {
    return this.database.withTenant({ tenantId }, async (client) => {
      const result = await client.query<MembershipRow>(
        `SELECT u.id AS user_id, m.id AS membership_id, rp.permission_key
         FROM users u
         JOIN memberships m ON m.user_id = u.id AND m.tenant_id = $1 AND m.status = 'active'
         LEFT JOIN membership_roles mr ON mr.membership_id = m.id AND mr.tenant_id = m.tenant_id
         LEFT JOIN role_permissions rp ON rp.role_id = mr.role_id AND rp.tenant_id = m.tenant_id
         WHERE u.external_subject = $2`,
        [tenantId, subject]
      );
      const first = result.rows[0];
      if (!first) return null;
      const scopes = await client.query<AccessScopeRow>(
        `SELECT scope_type,organization_id,branch_id FROM access_scopes
         WHERE membership_id=$1 ORDER BY scope_type,organization_id,branch_id`,
        [first.membership_id]
      );
      return {
        userId: first.user_id,
        membershipId: first.membership_id,
        permissions: new Set(result.rows.flatMap((row) => (row.permission_key ? [row.permission_key] : []))),
        tenantWide: scopes.rows.some((scope) => scope.scope_type === "tenant"),
        organizationIds: new Set(scopes.rows.flatMap((scope) => scope.organization_id ? [scope.organization_id] : [])),
        branchIds: new Set(scopes.rows.flatMap((scope) => scope.branch_id ? [scope.branch_id] : []))
      };
    });
  }
}
