import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";
const suite = describe;

suite("appointment conflict constraints", () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const tenantId = randomUUID(); const organizationId = randomUUID(); const branchId = randomUUID();
  const patientId = randomUUID(); const employeeId = randomUUID(); const doctorId = randomUUID(); const chairId = randomUUID();

  beforeAll(async () => {
    await client.connect(); await client.query("BEGIN");
    await client.query("INSERT INTO tenants (id,slug,name) VALUES ($1,$2,'Conflict Test')", [tenantId, `conflict-${tenantId}`]);
    await client.query("INSERT INTO organizations (id,tenant_id,code,name) VALUES ($1,$2,'main','Clinic')", [organizationId, tenantId]);
    await client.query("INSERT INTO branches (id,tenant_id,organization_id,code,name) VALUES ($1,$2,$3,'main','Branch')", [branchId, tenantId, organizationId]);
    await client.query("INSERT INTO patients (id,tenant_id,first_name,last_name,phone,phone_normalized) VALUES ($1,$2,'A','Patient','1','1')", [patientId, tenantId]);
    await client.query("INSERT INTO employees (id,tenant_id,first_name,last_name) VALUES ($1,$2,'A','Doctor')", [employeeId, tenantId]);
    await client.query("INSERT INTO doctors (id,tenant_id,employee_id) VALUES ($1,$2,$3)", [doctorId, tenantId, employeeId]);
    await client.query("INSERT INTO chairs (id,tenant_id,branch_id,code,name) VALUES ($1,$2,$3,'one','Chair')", [chairId, tenantId, branchId]);
    await client.query(`INSERT INTO appointments (tenant_id,patient_id,doctor_id,branch_id,chair_id,starts_at,ends_at)
      VALUES ($1,$2,$3,$4,$5,'2030-01-01T09:00:00Z','2030-01-01T10:00:00Z')`, [tenantId, patientId, doctorId, branchId, chairId]);
  });

  afterAll(async () => { await client.query("ROLLBACK"); await client.end(); });

  it("rejects an overlapping doctor/chair reservation", async () => {
    await expect(client.query(`INSERT INTO appointments (tenant_id,patient_id,doctor_id,branch_id,chair_id,starts_at,ends_at)
      VALUES ($1,$2,$3,$4,$5,'2030-01-01T09:30:00Z','2030-01-01T10:30:00Z')`,
      [tenantId, patientId, doctorId, branchId, chairId])).rejects.toMatchObject({ code: "23P01" });
  });
});
