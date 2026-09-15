import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("clinical record immutability", () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const tenantId = randomUUID(); const userId = randomUUID(); const organizationId = randomUUID();
  const branchId = randomUUID(); const patientId = randomUUID(); const employeeId = randomUUID();
  const doctorId = randomUUID(); const encounterId = randomUUID(); const noteId = randomUUID();

  beforeAll(async () => {
    await client.connect(); await client.query("BEGIN");
    await client.query("INSERT INTO tenants (id,slug,name) VALUES ($1,$2,'Clinical Test')", [tenantId, `clinical-${tenantId}`]);
    await client.query("INSERT INTO users (id,external_subject,display_name) VALUES ($1,$2,'Doctor')", [userId, `doctor-${userId}`]);
    await client.query("INSERT INTO organizations (id,tenant_id,code,name) VALUES ($1,$2,'main','Clinic')", [organizationId, tenantId]);
    await client.query("INSERT INTO branches (id,tenant_id,organization_id,code,name) VALUES ($1,$2,$3,'main','Branch')", [branchId, tenantId, organizationId]);
    await client.query("INSERT INTO patients (id,tenant_id,first_name,last_name,phone,phone_normalized) VALUES ($1,$2,'A','Patient','1','1')", [patientId, tenantId]);
    await client.query("INSERT INTO employees (id,tenant_id,user_id,first_name,last_name) VALUES ($1,$2,$3,'A','Doctor')", [employeeId, tenantId, userId]);
    await client.query("INSERT INTO doctors (id,tenant_id,employee_id) VALUES ($1,$2,$3)", [doctorId, tenantId, employeeId]);
    await client.query(`INSERT INTO encounters (id,tenant_id,patient_id,doctor_id,branch_id,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$6)`, [encounterId, tenantId, patientId, doctorId, branchId, userId]);
    await client.query(`INSERT INTO clinical_notes
      (id,tenant_id,encounter_id,patient_id,doctor_id,title,content,status,current_version,signed_at,signed_by,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,'Exam','Signed text','signed',1,now(),$6,$6,$6)`, [noteId, tenantId, encounterId, patientId, doctorId, userId]);
    await client.query(`INSERT INTO clinical_note_versions
      (tenant_id,clinical_note_id,version_number,title,content,author_user_id,signed_at)
      VALUES ($1,$2,1,'Exam','Signed text',$3,now())`, [tenantId, noteId, userId]);
  });

  afterAll(async () => { await client.query("ROLLBACK"); await client.end(); });

  it("rejects silent edits to a signed note", async () => {
    await client.query("SAVEPOINT signed_note_edit");
    await expect(client.query("UPDATE clinical_notes SET content='overwritten' WHERE id=$1", [noteId]))
      .rejects.toMatchObject({ code: "55000" });
    await client.query("ROLLBACK TO SAVEPOINT signed_note_edit");
  });

  it("keeps version history append-only", async () => {
    await client.query("SAVEPOINT version_edit");
    await expect(client.query("UPDATE clinical_note_versions SET content='overwritten' WHERE clinical_note_id=$1", [noteId]))
      .rejects.toMatchObject({ code: "55000" });
    await client.query("ROLLBACK TO SAVEPOINT version_edit");
  });
});
