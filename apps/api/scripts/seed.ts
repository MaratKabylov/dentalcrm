import { randomUUID } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

const slug = process.env.SEED_TENANT_SLUG ?? "demo-clinic";
const subject = process.env.SEED_USER_SUBJECT ?? "local-owner";
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");
  const tenant = await client.query<{ id: string }>(
    `INSERT INTO tenants (slug, name) VALUES ($1, 'Demo Dental Clinic')
     ON CONFLICT (slug) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [slug]
  );
  const user = await client.query<{ id: string }>(
    `INSERT INTO users (external_subject, email, display_name) VALUES ($1, 'owner@example.local', 'Local Owner')
     ON CONFLICT (external_subject) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [subject]
  );
  const tenantId = tenant.rows[0]!.id;
  const userId = user.rows[0]!.id;
  await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  await client.query(
    `INSERT INTO organizations (tenant_id, code, name, created_by, updated_by)
     VALUES ($1, 'main', 'Demo Dental Clinic', $2, $2)
     ON CONFLICT (tenant_id, code) DO NOTHING`,
    [tenantId, userId]
  );
  const organization = await client.query<{ id: string }>(
    "SELECT id FROM organizations WHERE tenant_id = $1 AND code = 'main'",
    [tenantId]
  );
  await client.query(
    `INSERT INTO branches (tenant_id, organization_id, code, name, created_by, updated_by)
     VALUES ($1, $2, 'main', 'Main Branch', $3, $3)
     ON CONFLICT (tenant_id, code) DO NOTHING`,
    [tenantId, organization.rows[0]!.id, userId]
  );
  const membershipId = randomUUID();
  await client.query(
    `INSERT INTO memberships (id, tenant_id, user_id, status, created_by, updated_by)
     VALUES ($1, $2, $3, 'active', $3, $3)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active'`,
    [membershipId, tenantId, userId]
  );
  const membership = await client.query<{ id: string }>(
    "SELECT id FROM memberships WHERE tenant_id = $1 AND user_id = $2",
    [tenantId, userId]
  );
  const role = await client.query<{ id: string }>(
    `INSERT INTO roles (tenant_id, key, name, is_system, created_by, updated_by)
     VALUES ($1, 'owner', 'Owner', true, $2, $2)
     ON CONFLICT (tenant_id, key) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [tenantId, userId]
  );
  await client.query(
    `INSERT INTO role_permissions (tenant_id, role_id, permission_key, created_by)
     SELECT $1, $2, key, $3 FROM permissions
     ON CONFLICT DO NOTHING`,
    [tenantId, role.rows[0]!.id, userId]
  );
  await client.query(
    `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [tenantId, membership.rows[0]!.id, role.rows[0]!.id, userId]
  );
  await client.query("COMMIT");
  console.info(JSON.stringify({ tenantId, subject, headers: { "x-tenant-id": tenantId, "x-user-subject": subject } }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
