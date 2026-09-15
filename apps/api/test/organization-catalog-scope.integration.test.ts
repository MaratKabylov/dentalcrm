import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("organization-owned catalogs", () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const tenantId = randomUUID();
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const branchA = randomUUID();
  let categoryA = "";
  let serviceB = "";

  beforeAll(async () => {
    await client.connect();
    await client.query("BEGIN");
    await client.query("INSERT INTO tenants (id,slug,name) VALUES ($1,$2,'Catalog tenant')", [tenantId, `catalog-${tenantId}`]);
    await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    await client.query(`INSERT INTO organizations (id,tenant_id,code,name) VALUES
      ($1,$3,'org-a','Organization A'),($2,$3,'org-b','Organization B')`, [organizationA,organizationB,tenantId]);
    await client.query(`INSERT INTO branches (id,tenant_id,organization_id,code,name) VALUES
      ($1,$2,$3,'branch-a','Branch A')`, [branchA,tenantId,organizationA]);
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    await client.end();
  });

  it("allows the same catalog code in two organizations of one tenant", async () => {
    const rows = await client.query<{id:string;organization_id:string}>(`INSERT INTO service_categories
      (tenant_id,organization_id,code,name) VALUES ($1,$2,'therapy','Therapy A'),($1,$3,'therapy','Therapy B')
      RETURNING id,organization_id`, [tenantId,organizationA,organizationB]);
    expect(rows.rowCount).toBe(2);
    categoryA = rows.rows.find((row) => row.organization_id === organizationA)!.id;
    serviceB = (await client.query<{id:string}>(`INSERT INTO services
      (tenant_id,organization_id,code,name,duration_minutes) VALUES ($1,$2,'consultation','Consultation B',30) RETURNING id`,
      [tenantId,organizationB])).rows[0]!.id;
  });

  it("rejects a service linked to a category from another organization", async () => {
    await client.query("SAVEPOINT cross_category");
    await expect(client.query(`INSERT INTO services
      (tenant_id,organization_id,category_id,code,name,duration_minutes) VALUES ($1,$2,$3,'invalid','Invalid',30)`,
      [tenantId,organizationB,categoryA])).rejects.toMatchObject({code:"23503"});
    await client.query("ROLLBACK TO SAVEPOINT cross_category");
  });

  it("rejects a price list item containing a service from another organization", async () => {
    const priceList = (await client.query<{id:string}>(`INSERT INTO price_lists
      (tenant_id,organization_id,branch_id,name,valid_from) VALUES ($1,$2,$3,'Price A',CURRENT_DATE) RETURNING id`,
      [tenantId,organizationA,branchA])).rows[0]!.id;
    await client.query("SAVEPOINT cross_price");
    await expect(client.query(`INSERT INTO price_list_items
      (tenant_id,organization_id,price_list_id,service_id,price_minor) VALUES ($1,$2,$3,$4,1000)`,
      [tenantId,organizationA,priceList,serviceB])).rejects.toMatchObject({code:"23503"});
    await client.query("ROLLBACK TO SAVEPOINT cross_price");
  });
});
