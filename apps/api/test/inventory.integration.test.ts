import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl=process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("inventory ledger invariants",()=>{
  const client=new pg.Client({connectionString:databaseUrl});
  const tenantId=randomUUID(),userId=randomUUID(),organizationId=randomUUID(),branchId=randomUUID(),warehouseId=randomUUID();
  const unitId=randomUUID(),productId=randomUUID(),earlyBatchId=randomUUID(),lateBatchId=randomUUID(),documentId=randomUUID();
  let earlyMovementId="";

  beforeAll(async()=>{
    await client.connect();await client.query("BEGIN");
    await client.query("INSERT INTO tenants(id,slug,name) VALUES($1,$2,'Inventory tenant')",[tenantId,`inventory-${tenantId}`]);
    await client.query("INSERT INTO users(id,external_subject,display_name) VALUES($1,$2,'Storekeeper')",[userId,`storekeeper-${userId}`]);
    await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    await client.query("INSERT INTO organizations(id,tenant_id,code,name) VALUES($1,$2,'main','Main')",[organizationId,tenantId]);
    await client.query("INSERT INTO branches(id,tenant_id,organization_id,code,name) VALUES($1,$2,$3,'main','Main')",
      [branchId,tenantId,organizationId]);
    await client.query(`INSERT INTO units_of_measure(id,tenant_id,organization_id,code,name,symbol,created_by)
      VALUES($1,$2,$3,'piece','Piece','pc',$4)`,[unitId,tenantId,organizationId,userId]);
    await client.query(`INSERT INTO products(id,tenant_id,organization_id,unit_id,sku,name,track_batches,created_by)
      VALUES($1,$2,$3,$4,'composite','Composite',true,$5)`,[productId,tenantId,organizationId,unitId,userId]);
    await client.query(`INSERT INTO warehouses(id,tenant_id,organization_id,branch_id,code,name,created_by)
      VALUES($1,$2,$3,$4,'main','Main stock',$5)`,[warehouseId,tenantId,organizationId,branchId,userId]);
    await client.query(`INSERT INTO product_batches(id,tenant_id,organization_id,product_id,lot_number,expires_at)
      VALUES($1,$3,$4,$5,'early','2030-01-01'),($2,$3,$4,$5,'late','2031-01-01')`,
      [earlyBatchId,lateBatchId,tenantId,organizationId,productId]);
    await client.query(`INSERT INTO stock_documents(id,tenant_id,organization_id,document_type,status,destination_warehouse_id,
      occurred_at,posted_at,posted_by,created_by) VALUES($1,$2,$3,'receipt','posted',$4,now(),now(),$5,$5)`,
      [documentId,tenantId,organizationId,warehouseId,userId]);
    const earlyLine=randomUUID(),lateLine=randomUUID();
    await client.query(`INSERT INTO stock_document_lines(id,tenant_id,organization_id,document_id,product_id,batch_id,requested_quantity)
      VALUES($1,$3,$4,$5,$6,$7,4),($2,$3,$4,$5,$6,$8,6)`,
      [earlyLine,lateLine,tenantId,organizationId,documentId,productId,earlyBatchId,lateBatchId]);
    earlyMovementId=(await client.query<{id:string}>(`INSERT INTO stock_movements
      (tenant_id,organization_id,warehouse_id,product_id,batch_id,document_id,document_line_id,quantity_delta,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,4,$8),($1,$2,$3,$4,$9,$6,$10,6,$8) RETURNING id`,
      [tenantId,organizationId,warehouseId,productId,earlyBatchId,documentId,earlyLine,userId,lateBatchId,lateLine])).rows[0]!.id;
  });

  afterAll(async()=>{await client.query("ROLLBACK");await client.end();});

  it("derives balance exclusively from stock movements",async()=>{
    const balance=(await client.query<{quantity:string}>(`SELECT sum(quantity_delta)::text AS quantity FROM stock_movements
      WHERE warehouse_id=$1 AND product_id=$2`,[warehouseId,productId])).rows[0]!;
    expect(Number(balance.quantity)).toBe(10);
  });

  it("orders positive batches by FEFO",async()=>{
    const rows=(await client.query<{batchId:string;quantity:string}>(`SELECT m.batch_id AS "batchId",sum(m.quantity_delta)::text AS quantity
      FROM stock_movements m JOIN product_batches b ON b.id=m.batch_id WHERE m.warehouse_id=$1 AND m.product_id=$2
      GROUP BY m.batch_id,b.expires_at,b.manufactured_at HAVING sum(m.quantity_delta)>0
      ORDER BY b.expires_at ASC NULLS LAST,b.manufactured_at ASC NULLS LAST,m.batch_id`,[warehouseId,productId])).rows;
    expect(rows.map((row)=>row.batchId)).toEqual([earlyBatchId,lateBatchId]);
  });

  it("denies updates and deletes of posted movements to the application role",async()=>{
    await client.query("SAVEPOINT immutable_stock");
    await expect(client.query("UPDATE stock_movements SET quantity_delta=99 WHERE id=$1",[earlyMovementId]))
      .rejects.toMatchObject({code:"42501"});
    await client.query("ROLLBACK TO SAVEPOINT immutable_stock");
    await client.query("SAVEPOINT immutable_stock_delete");
    await expect(client.query("DELETE FROM stock_movements WHERE id=$1",[earlyMovementId]))
      .rejects.toMatchObject({code:"42501"});
    await client.query("ROLLBACK TO SAVEPOINT immutable_stock_delete");
  });

  it("creates a planned procedure consumption from a service recipe exactly once",async()=>{
    const patientId=randomUUID(),employeeId=randomUUID(),doctorId=randomUUID(),serviceId=randomUUID(),encounterId=randomUUID(),procedureId=randomUUID();
    await client.query("INSERT INTO patients(id,tenant_id,first_name,last_name,phone,phone_normalized) VALUES($1,$2,'A','Patient','1','1')",
      [patientId,tenantId]);
    await client.query("INSERT INTO employees(id,tenant_id,first_name,last_name) VALUES($1,$2,'Test','Doctor')",[employeeId,tenantId]);
    await client.query("INSERT INTO doctors(id,tenant_id,employee_id) VALUES($1,$2,$3)",[doctorId,tenantId,employeeId]);
    await client.query(`INSERT INTO services(id,tenant_id,organization_id,code,name,duration_minutes)
      VALUES($1,$2,$3,'filling','Filling',60)`,[serviceId,tenantId,organizationId]);
    await client.query(`INSERT INTO encounters(id,tenant_id,patient_id,doctor_id,branch_id,status)
      VALUES($1,$2,$3,$4,$5,'in_progress')`,[encounterId,tenantId,patientId,doctorId,branchId]);
    await client.query(`INSERT INTO procedures(id,tenant_id,encounter_id,patient_id,doctor_id,service_id,quantity,status,completed_at)
      VALUES($1,$2,$3,$4,$5,$6,2,'completed',now())`,[procedureId,tenantId,encounterId,patientId,doctorId,serviceId]);
    const recipe=(await client.query<{id:string}>(`INSERT INTO service_material_recipes(tenant_id,organization_id,service_id)
      VALUES($1,$2,$3) RETURNING id`,[tenantId,organizationId,serviceId])).rows[0]!;
    await client.query(`INSERT INTO service_material_recipe_items(tenant_id,organization_id,recipe_id,product_id,quantity)
      VALUES($1,$2,$3,$4,0.3)`,[tenantId,organizationId,recipe.id,productId]);
    const consumption=(await client.query<{id:string}>(`INSERT INTO material_consumptions(tenant_id,organization_id,procedure_id)
      VALUES($1,$2,$3) ON CONFLICT(tenant_id,procedure_id) DO NOTHING RETURNING id`,[tenantId,organizationId,procedureId])).rows[0]!;
    await client.query(`INSERT INTO material_consumption_lines(tenant_id,organization_id,consumption_id,product_id,planned_quantity)
      SELECT $1,$2,$3,i.product_id,i.quantity*p.quantity FROM service_material_recipe_items i CROSS JOIN procedures p
      WHERE i.recipe_id=$4 AND p.id=$5`,[tenantId,organizationId,consumption.id,recipe.id,procedureId]);
    const quantity=(await client.query<{quantity:string}>(`SELECT planned_quantity::text AS quantity FROM material_consumption_lines
      WHERE consumption_id=$1`,[consumption.id])).rows[0]!;
    expect(Number(quantity.quantity)).toBe(0.6);
    expect((await client.query(`INSERT INTO material_consumptions(tenant_id,organization_id,procedure_id) VALUES($1,$2,$3)
      ON CONFLICT(tenant_id,procedure_id) DO NOTHING`,[tenantId,organizationId,procedureId])).rowCount).toBe(0);
  });
});
