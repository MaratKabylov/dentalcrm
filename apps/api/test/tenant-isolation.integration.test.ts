import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("PostgreSQL tenant isolation", () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const organizationA = randomUUID();

  beforeAll(async () => {
    await client.connect();
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO tenants (id, slug, name) VALUES ($1, $2, 'Tenant A'), ($3, $4, 'Tenant B')",
      [tenantA, `tenant-a-${tenantA}`, tenantB, `tenant-b-${tenantB}`]
    );
    await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
    await client.query(
      "INSERT INTO organizations (id, tenant_id, code, name) VALUES ($1, $2, 'main', 'A Clinic')",
      [organizationA, tenantA]
    );
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    await client.end();
  });

  it("does not reveal rows after switching to another tenant", async () => {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantB]);
    const result = await client.query("SELECT id FROM organizations WHERE id = $1", [organizationA]);
    expect(result.rowCount).toBe(0);
  });

  it("rejects a row stamped with another tenant", async () => {
    await expect(
      client.query(
        "INSERT INTO organizations (tenant_id, code, name) VALUES ($1, 'forged', 'Forged Clinic')",
        [tenantA]
      )
    ).rejects.toMatchObject({ code: "42501" });
  });
});
