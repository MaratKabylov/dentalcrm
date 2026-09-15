import type {
  CreateBranchInput, CreateChairInput, CreateDiagnosisCatalogInput, CreateEmployeeInput, CreatePriceListInput,
  CreateRoomInput, CreateServiceCategoryInput, CreateServiceInput, UpdateBranchInput, UpdateServiceCatalogInput
} from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

@Injectable()
export class ClinicService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService
  ) {}

  listBranches(auth: AuthContext) { return this.query(auth, `SELECT b.id,b.organization_id AS "organizationId",b.code,b.name,b.timezone,
    o.name AS "organizationName" FROM branches b JOIN organizations o ON o.id=b.organization_id
    WHERE b.archived_at IS NULL ORDER BY b.name`); }
  listRooms(auth: AuthContext) { return this.query(auth, `SELECT id, branch_id AS "branchId", code, name FROM rooms WHERE archived_at IS NULL ORDER BY name`); }
  listChairs(auth: AuthContext) { return this.query(auth, `SELECT id, branch_id AS "branchId", room_id AS "roomId", code, name FROM chairs WHERE archived_at IS NULL ORDER BY name`); }
  listServiceCategories(auth: AuthContext) { return this.query(auth, `SELECT id,code,name FROM service_categories WHERE archived_at IS NULL ORDER BY name`); }
  listServices(auth: AuthContext) { return this.query(auth, `SELECT id, category_id AS "categoryId", code, name, duration_minutes AS "durationMinutes", active FROM services WHERE active ORDER BY name`); }
  listDiagnoses(auth: AuthContext) { return this.query(auth, `SELECT id,code,name,active FROM diagnoses WHERE active ORDER BY code`); }
  listEmployees(auth: AuthContext) {
    return this.query(auth, `SELECT e.id, e.first_name AS "firstName", e.last_name AS "lastName", e.middle_name AS "middleName",
      e.phone, e.email, e.status, d.id AS "doctorId", d.specialty, d.calendar_color AS "calendarColor"
      FROM employees e LEFT JOIN doctors d ON d.tenant_id=e.tenant_id AND d.employee_id=e.id WHERE e.status<>'archived'
      ORDER BY e.last_name, e.first_name`);
  }
  listPriceLists(auth: AuthContext) {
    return this.query(auth, `SELECT p.id, p.branch_id AS "branchId", p.name, p.currency, p.valid_from AS "validFrom",
      p.valid_to AS "validTo", p.active, COALESCE(json_agg(json_build_object('serviceId', i.service_id, 'priceMinor', i.price_minor))
      FILTER (WHERE i.id IS NOT NULL), '[]') AS items FROM price_lists p LEFT JOIN price_list_items i
      ON i.tenant_id=p.tenant_id AND i.price_list_id=p.id WHERE p.active GROUP BY p.id ORDER BY p.valid_from DESC, p.name`);
  }

  createBranch(auth: AuthContext, input: CreateBranchInput) {
    return this.create(auth, "branch", "BranchCreated", async (client) => this.insertOne(client,
      `INSERT INTO branches (tenant_id,organization_id,code,name,timezone,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id,organization_id AS "organizationId",code,name,timezone`,
      [auth.tenantId,input.organizationId,input.code,input.name,input.timezone,auth.userId]));
  }

  updateBranch(auth: AuthContext, id: string, input: UpdateBranchInput) {
    return this.database.withTenant(auth, async (client) => {
      const before = await this.rowForUpdate(client,"branches",id,"archived_at IS NULL");
      if (!before) throw notFound("BRANCH_NOT_FOUND","Branch not found");
      const after=(await client.query<Record<string,unknown>>(`UPDATE branches SET name=COALESCE($2,name),
        timezone=COALESCE($3,timezone),updated_at=now(),updated_by=$4,version=version+1 WHERE id=$1
        RETURNING id,organization_id AS "organizationId",code,name,timezone`,[id,input.name ?? null,input.timezone ?? null,auth.userId])).rows[0]!;
      await this.recordMutation(client,auth,"branch","updated",id,before,after); return after;
    });
  }

  archiveBranch(auth: AuthContext,id:string) {
    return this.database.withTenant(auth,async(client)=>{
      const before=await this.rowForUpdate(client,"branches",id,"archived_at IS NULL");
      if(!before) throw notFound("BRANCH_NOT_FOUND","Branch not found");
      const dependencies=await client.query(`SELECT 1 FROM rooms WHERE branch_id=$1 AND archived_at IS NULL
        UNION ALL SELECT 1 FROM chairs WHERE branch_id=$1 AND archived_at IS NULL
        UNION ALL SELECT 1 FROM cashboxes WHERE branch_id=$1 AND archived_at IS NULL LIMIT 1`,[id]);
      if(dependencies.rows[0]) throw new ApiException(HttpStatus.CONFLICT,"BRANCH_HAS_RESOURCES","Archive branch resources first");
      await client.query(`UPDATE branches SET archived_at=now(),archived_by=$2,updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1`,[id,auth.userId]);
      const after={id,archived:true}; await this.recordMutation(client,auth,"branch","archived",id,before,after); return after;
    });
  }

  createRoom(auth: AuthContext, input: CreateRoomInput) {
    return this.create(auth, "room", "RoomCreated", async (client) => this.insertOne(client,
      `INSERT INTO rooms (tenant_id, branch_id, code, name, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$5)
       RETURNING id, branch_id AS "branchId", code, name`,
      [auth.tenantId, input.branchId, input.code, input.name, auth.userId]));
  }

  createChair(auth: AuthContext, input: CreateChairInput) {
    return this.create(auth, "chair", "ChairCreated", async (client) => this.insertOne(client,
      `INSERT INTO chairs (tenant_id, branch_id, room_id, code, name, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$6)
       RETURNING id, branch_id AS "branchId", room_id AS "roomId", code, name`,
      [auth.tenantId, input.branchId, input.roomId ?? null, input.code, input.name, auth.userId]));
  }

  createServiceCategory(auth: AuthContext,input:CreateServiceCategoryInput){
    return this.create(auth,"service_category","ServiceCategoryCreated",async(client)=>this.insertOne(client,
      `INSERT INTO service_categories (tenant_id,code,name,created_by,updated_by) VALUES ($1,$2,$3,$4,$4)
       RETURNING id,code,name`,[auth.tenantId,input.code,input.name,auth.userId]));
  }

  createEmployee(auth: AuthContext, input: CreateEmployeeInput) {
    return this.create(auth, "employee", "EmployeeCreated", async (client) => {
      const employee = await this.insertOne<{ id: string } & Record<string, unknown>>(client,
        `INSERT INTO employees (tenant_id, first_name, last_name, middle_name, phone, email, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id, first_name AS "firstName", last_name AS "lastName",
         middle_name AS "middleName", phone, email, status`,
        [auth.tenantId, input.firstName, input.lastName, input.middleName ?? null, input.phone ?? null, input.email ?? null, auth.userId]);
      for (const branchId of new Set(input.branchIds)) {
        await client.query(`INSERT INTO employee_branches (tenant_id, employee_id, branch_id) VALUES ($1,$2,$3)`,
          [auth.tenantId, employee.id, branchId]);
      }
      if (input.doctor) {
        const doctor = await this.insertOne<{ id: string }>(client,
          `INSERT INTO doctors (tenant_id, employee_id, specialty, calendar_color) VALUES ($1,$2,$3,$4) RETURNING id`,
          [auth.tenantId, employee.id, input.doctor.specialty ?? null, input.doctor.color ?? "#0d766f"]);
        employee.doctorId = doctor.id;
      }
      return employee;
    });
  }

  createService(auth: AuthContext, input: CreateServiceInput) {
    return this.create(auth, "service", "ServiceCreated", async (client) => this.insertOne(client,
      `INSERT INTO services (tenant_id, category_id, code, name, duration_minutes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id, category_id AS "categoryId", code, name,
       duration_minutes AS "durationMinutes", active`,
      [auth.tenantId, input.categoryId ?? null, input.code, input.name, input.durationMinutes, auth.userId]));
  }

  updateService(auth:AuthContext,id:string,input:UpdateServiceCatalogInput){
    return this.database.withTenant(auth,async(client)=>{
      const before=await this.rowForUpdate(client,"services",id,"active");
      if(!before) throw notFound("SERVICE_NOT_FOUND","Service not found");
      const hasCategory=Object.prototype.hasOwnProperty.call(input,"categoryId");
      const after=(await client.query<Record<string,unknown>>(`UPDATE services SET name=COALESCE($2,name),
        category_id=CASE WHEN $3 THEN $4 ELSE category_id END,duration_minutes=COALESCE($5,duration_minutes),
        updated_at=now(),updated_by=$6,version=version+1 WHERE id=$1 RETURNING id,category_id AS "categoryId",code,name,
        duration_minutes AS "durationMinutes",active`,[id,input.name ?? null,hasCategory,input.categoryId ?? null,
          input.durationMinutes ?? null,auth.userId])).rows[0]!;
      await this.recordMutation(client,auth,"service","updated",id,before,after); return after;
    });
  }

  createPriceList(auth: AuthContext, input: CreatePriceListInput) {
    return this.create(auth, "price_list", "PriceListCreated", async (client) => {
      const priceList = await this.insertOne<{ id: string } & Record<string, unknown>>(client,
        `INSERT INTO price_lists (tenant_id, branch_id, name, currency, valid_from, valid_to, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id, branch_id AS "branchId", name, currency,
         valid_from AS "validFrom", valid_to AS "validTo", active`,
        [auth.tenantId, input.branchId ?? null, input.name, input.currency.toUpperCase(), input.validFrom, input.validTo ?? null, auth.userId]);
      for (const item of input.items) {
        await client.query(`INSERT INTO price_list_items (tenant_id, price_list_id, service_id, price_minor) VALUES ($1,$2,$3,$4)`,
          [auth.tenantId, priceList.id, item.serviceId, item.priceMinor]);
      }
      priceList.items = input.items;
      return priceList;
    });
  }

  createDiagnosis(auth:AuthContext,input:CreateDiagnosisCatalogInput){
    return this.create(auth,"diagnosis","DiagnosisCreated",async(client)=>this.insertOne(client,
      `INSERT INTO diagnoses (tenant_id,code,name) VALUES ($1,$2,$3) RETURNING id,code,name,active`,
      [auth.tenantId,input.code,input.name]));
  }

  rename(auth:AuthContext,resource:MutableResource,id:string,name:string){
    const config=resourceConfig[resource];
    return this.database.withTenant(auth,async(client)=>{
      const before=await this.rowForUpdate(client,config.table,id,config.active);
      if(!before) throw notFound("RESOURCE_NOT_FOUND",`${config.label} not found`);
      const after=(await client.query<Record<string,unknown>>(`UPDATE ${config.table} SET name=$2,updated_at=now(),
        updated_by=$3,version=version+1 WHERE id=$1 RETURNING id,code,name`,[id,name,auth.userId])).rows[0]!;
      await this.recordMutation(client,auth,resource,"updated",id,before,after); return after;
    });
  }

  archive(auth:AuthContext,resource:MutableResource,id:string){
    const config=resourceConfig[resource];
    return this.database.withTenant(auth,async(client)=>{
      const before=await this.rowForUpdate(client,config.table,id,config.active);
      if(!before) throw notFound("RESOURCE_NOT_FOUND",`${config.label} not found`);
      await client.query(`UPDATE ${config.table} SET ${config.archive},updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1`,
        [id,auth.userId]);
      const after={id,archived:true}; await this.recordMutation(client,auth,resource,"archived",id,before,after); return after;
    });
  }

  private query(auth: AuthContext, sql: string): Promise<Record<string, unknown>[]> {
    return this.database.withTenant(auth, async (client) => (await client.query(sql)).rows);
  }

  private async rowForUpdate(client:PoolClient,table:string,id:string,active:string){
    return (await client.query<Record<string,unknown>>(`SELECT * FROM ${table} WHERE id=$1 AND ${active} FOR UPDATE`,[id])).rows[0];
  }

  private async recordMutation(client:PoolClient,auth:AuthContext,entityType:string,verb:string,id:string,before:unknown,after:unknown){
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action:`${entityType}.${verb}`,
      entityType,entityId:id,before,after,requestId:auth.requestId});
    await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,aggregateId:id,
      eventType:`${pascal(entityType)}${pascal(verb)}`,payload:{id},requestId:auth.requestId});
  }

  private async create<T extends { id: string }>(auth: AuthContext, entityType: string, eventType: string,
    operation: (client: PoolClient) => Promise<T>): Promise<T> {
    try {
      return await this.database.withTenant(auth, async (client) => {
        const entity = await operation(client);
        await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId,
          action: `${entityType}.created`, entityType, entityId: entity.id, after: entity, requestId: auth.requestId });
        await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: entityType,
          aggregateId: entity.id, eventType, payload: { id: entity.id }, requestId: auth.requestId });
        return entity;
      });
    } catch (error) {
      if (isConstraintViolation(error)) throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "Resource conflicts with existing clinic data");
      throw error;
    }
  }

  private async insertOne<T extends { id: string }>(client: PoolClient, sql: string, values: unknown[]): Promise<T> {
    const row = (await client.query<T>(sql, values)).rows[0];
    if (!row) throw new Error("Insert returned no row");
    return row;
  }
}

type MutableResource="room"|"chair"|"employee"|"service_category"|"service"|"price_list"|"diagnosis";
const resourceConfig:Record<MutableResource,{table:string;active:string;archive:string;label:string}>={
  room:{table:"rooms",active:"archived_at IS NULL",archive:"archived_at=now(),archived_by=$2",label:"Room"},
  chair:{table:"chairs",active:"archived_at IS NULL",archive:"archived_at=now(),archived_by=$2",label:"Chair"},
  employee:{table:"employees",active:"status<>'archived'",archive:"status='archived'",label:"Employee"},
  service_category:{table:"service_categories",active:"archived_at IS NULL",archive:"archived_at=now(),archived_by=$2",label:"Service category"},
  service:{table:"services",active:"active",archive:"active=false",label:"Service"},
  price_list:{table:"price_lists",active:"active",archive:"active=false",label:"Price list"},
  diagnosis:{table:"diagnoses",active:"active",archive:"active=false",label:"Diagnosis"}
};

function isConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && ["23503", "23505"].includes(String(error.code));
}
function notFound(code:string,message:string){return new ApiException(HttpStatus.NOT_FOUND,code,message);}
function pascal(value:string){return value.split("_").map((part)=>part[0]!.toUpperCase()+part.slice(1)).join("");}
