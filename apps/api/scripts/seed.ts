import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { createPasswordHash } from "../src/modules/identity/password.js";

const databaseUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ??
  "postgresql://dental:local-development-only@localhost:5432/dental";

const slug = process.env.SEED_TENANT_SLUG ?? "demo-clinic";
const authMode = process.env.AUTH_MODE ?? "local";
const login = (process.env.SEED_LOGIN ?? "owner").toLowerCase();
const email = (process.env.SEED_EMAIL ?? "owner@example.com").toLowerCase();
const password = process.env.SEED_PASSWORD ?? "change-me-local";
const subject = await resolveSeedSubject();
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
    `INSERT INTO users (external_subject, email, display_name) VALUES ($1, $2, 'Clinic Owner')
     ON CONFLICT (external_subject) DO UPDATE SET email=EXCLUDED.email,updated_at=now()
     RETURNING id`,
    [subject, email]
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
  const branch = await client.query<{ id: string }>(
    "SELECT id FROM branches WHERE tenant_id = $1 AND code = 'main'",
    [tenantId]
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
  if (authMode === "local") {
    const passwordCredential = await createPasswordHash(password);
    await client.query(
      `INSERT INTO local_credentials (tenant_id,user_id,username,password_hash,password_salt)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,user_id) DO NOTHING`,
      [tenantId,userId,login,passwordCredential.hash,passwordCredential.salt]
    );
  }
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
  await client.query(
    `INSERT INTO access_scopes (tenant_id,membership_id,scope_type,created_by)
     VALUES ($1,$2,'tenant',$3) ON CONFLICT DO NOTHING`,
    [tenantId,membership.rows[0]!.id,userId]
  );
  const branchId = branch.rows[0]!.id;
  await client.query(
    `INSERT INTO rooms (tenant_id, branch_id, code, name, created_by, updated_by)
     VALUES ($1, $2, 'room-1', 'Кабинет 1', $3, $3) ON CONFLICT (tenant_id, branch_id, code) DO NOTHING`,
    [tenantId, branchId, userId]
  );
  const room = await client.query<{ id: string }>("SELECT id FROM rooms WHERE tenant_id=$1 AND branch_id=$2 AND code='room-1'", [tenantId, branchId]);
  await client.query(
    `INSERT INTO chairs (tenant_id, branch_id, room_id, code, name, created_by, updated_by)
     VALUES ($1, $2, $3, 'chair-1', 'Кресло 1', $4, $4) ON CONFLICT (tenant_id, branch_id, code) DO NOTHING`,
    [tenantId, branchId, room.rows[0]!.id, userId]
  );
  let employee = await client.query<{ id: string }>("SELECT id FROM employees WHERE tenant_id=$1 AND email='doctor@example.local'", [tenantId]);
  if (!employee.rows[0]) {
    employee = await client.query<{ id: string }>(
      `INSERT INTO employees (tenant_id, first_name, last_name, email, created_by, updated_by)
       VALUES ($1, 'Айдана', 'Серикова', 'doctor@example.local', $2, $2) RETURNING id`, [tenantId, userId]);
  }
  await client.query(`INSERT INTO employee_branches (tenant_id, employee_id, branch_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [tenantId, employee.rows[0]!.id, branchId]);
  await client.query(`INSERT INTO doctors (tenant_id, employee_id, specialty) VALUES ($1,$2,'Терапевт') ON CONFLICT (tenant_id, employee_id) DO NOTHING`,
    [tenantId, employee.rows[0]!.id]);
  await client.query(
    `INSERT INTO services (tenant_id,organization_id,code,name,duration_minutes,created_by,updated_by)
     VALUES ($1,$2,'consultation','Первичная консультация',30,$3,$3)
     ON CONFLICT (tenant_id,organization_id,code) DO NOTHING`, [tenantId,organization.rows[0]!.id,userId]);
  await client.query("COMMIT");
  console.info(JSON.stringify({ tenantId, subject, login: { tenant: slug, email }, authMode }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

async function resolveSeedSubject(): Promise<string> {
  if (authMode !== "supabase") return process.env.SEED_USER_SUBJECT ?? "local-owner";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serverKey) throw new Error("Supabase URL and server key are required to seed Supabase Auth");
  const supabase = createClient(url, serverKey, { auth: { autoRefreshToken: false, persistSession: false } });

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const existing = data.users.find((user) => user.email?.toLowerCase() === email);
    if (existing) return existing.id;
    if (data.users.length < 100) break;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Clinic Owner" },
    app_metadata: { tenant_slug: slug }
  });
  if (error || !data.user) throw error ?? new Error("Supabase Auth user was not created");
  return data.user.id;
}
