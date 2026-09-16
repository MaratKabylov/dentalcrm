import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("CRM and workflow organization boundaries", () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const tenantId = randomUUID();
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const branchB = randomUUID();
  let patientId = "";
  let stageA = "";
  let treatmentPlanB = "";

  beforeAll(async () => {
    await client.connect();
    await client.query("BEGIN");
    await client.query("INSERT INTO tenants(id,slug,name) VALUES($1,$2,'CRM workflow tenant')", [tenantId, `crm-${tenantId}`]);
    await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    await client.query(`INSERT INTO organizations(id,tenant_id,code,name) VALUES
      ($1,$3,'org-a','Organization A'),($2,$3,'org-b','Organization B')`, [organizationA,organizationB,tenantId]);
    await client.query("INSERT INTO branches(id,tenant_id,organization_id,code,name) VALUES($1,$2,$3,'branch-b','Branch B')",
      [branchB,tenantId,organizationB]);
    patientId = (await client.query<{id:string}>(`INSERT INTO patients(tenant_id,first_name,last_name,phone,phone_normalized)
      VALUES($1,'CRM','Patient','+77000000001','77000000001') RETURNING id`, [tenantId])).rows[0]!.id;
    treatmentPlanB = (await client.query<{id:string}>(`INSERT INTO treatment_plans(tenant_id,organization_id,patient_id,title)
      VALUES($1,$2,$3,'Organization B plan') RETURNING id`, [tenantId,organizationB,patientId])).rows[0]!.id;
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    await client.end();
  });

  it("allows the same pipeline stage key in separate organizations", async () => {
    const stages = await client.query<{id:string;organization_id:string}>(`INSERT INTO opportunity_stages
      (tenant_id,organization_id,key,name,position,is_initial) VALUES
      ($1,$2,'new','New A',0,true),($1,$3,'new','New B',0,true) RETURNING id,organization_id`,
      [tenantId,organizationA,organizationB]);
    expect(stages.rowCount).toBe(2);
    stageA = stages.rows.find((stage) => stage.organization_id === organizationA)!.id;
  });

  it("rejects an opportunity linked to a treatment plan from another organization", async () => {
    await client.query("SAVEPOINT cross_organization_plan");
    await expect(client.query(`INSERT INTO opportunities
      (tenant_id,organization_id,patient_id,treatment_plan_id,stage_id,title)
      VALUES($1,$2,$3,$4,$5,'Invalid opportunity')`,
      [tenantId,organizationA,patientId,treatmentPlanB,stageA])).rejects.toMatchObject({code:"23503"});
    await client.query("ROLLBACK TO SAVEPOINT cross_organization_plan");
  });

  it("rejects a task branch from another organization", async () => {
    await client.query("SAVEPOINT cross_organization_task");
    await expect(client.query(`INSERT INTO tasks(tenant_id,organization_id,branch_id,title)
      VALUES($1,$2,$3,'Invalid task')`, [tenantId,organizationA,branchB])).rejects.toMatchObject({code:"23503"});
    await client.query("ROLLBACK TO SAVEPOINT cross_organization_task");
  });

  it("enqueues one workflow run per rule and outbox event", async () => {
    const ruleId = (await client.query<{id:string}>(`INSERT INTO workflow_rules(tenant_id,organization_id,name,event_type)
      VALUES($1,$2,'Lead follow-up','LeadCreated') RETURNING id`, [tenantId,organizationA])).rows[0]!.id;
    const eventId = (await client.query<{id:string}>(`INSERT INTO outbox_events
      (tenant_id,aggregate_type,aggregate_id,event_type,payload,request_id)
      VALUES($1,'lead',$2,'LeadCreated',$3::jsonb,$4) RETURNING id`,
      [tenantId,randomUUID(),JSON.stringify({organizationId:organizationA}),randomUUID()])).rows[0]!.id;
    const enqueue = () => client.query(`INSERT INTO workflow_runs
      (tenant_id,organization_id,rule_id,event_id,event_type,event_payload,scheduled_at)
      VALUES($1,$2,$3,$4,'LeadCreated',$5::jsonb,now())
      ON CONFLICT(tenant_id,rule_id,event_id) DO NOTHING RETURNING id`,
      [tenantId,organizationA,ruleId,eventId,JSON.stringify({organizationId:organizationA})]);
    expect((await enqueue()).rowCount).toBe(1);
    expect((await enqueue()).rowCount).toBe(0);
  });
});
