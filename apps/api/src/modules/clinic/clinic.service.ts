import type {
  CreateChairInput, CreateEmployeeInput, CreatePriceListInput, CreateRoomInput, CreateServiceInput
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

  listRooms(auth: AuthContext) { return this.query(auth, `SELECT id, branch_id AS "branchId", code, name FROM rooms WHERE archived_at IS NULL ORDER BY name`); }
  listChairs(auth: AuthContext) { return this.query(auth, `SELECT id, branch_id AS "branchId", room_id AS "roomId", code, name FROM chairs WHERE archived_at IS NULL ORDER BY name`); }
  listServices(auth: AuthContext) { return this.query(auth, `SELECT id, category_id AS "categoryId", code, name, duration_minutes AS "durationMinutes", active FROM services ORDER BY name`); }
  listEmployees(auth: AuthContext) {
    return this.query(auth, `SELECT e.id, e.first_name AS "firstName", e.last_name AS "lastName", e.middle_name AS "middleName",
      e.phone, e.email, e.status, d.id AS "doctorId", d.specialty, d.calendar_color AS "calendarColor"
      FROM employees e LEFT JOIN doctors d ON d.tenant_id=e.tenant_id AND d.employee_id=e.id
      ORDER BY e.last_name, e.first_name`);
  }
  listPriceLists(auth: AuthContext) {
    return this.query(auth, `SELECT p.id, p.branch_id AS "branchId", p.name, p.currency, p.valid_from AS "validFrom",
      p.valid_to AS "validTo", p.active, COALESCE(json_agg(json_build_object('serviceId', i.service_id, 'priceMinor', i.price_minor))
      FILTER (WHERE i.id IS NOT NULL), '[]') AS items FROM price_lists p LEFT JOIN price_list_items i
      ON i.tenant_id=p.tenant_id AND i.price_list_id=p.id GROUP BY p.id ORDER BY p.valid_from DESC, p.name`);
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

  private query(auth: AuthContext, sql: string): Promise<Record<string, unknown>[]> {
    return this.database.withTenant(auth, async (client) => (await client.query(sql)).rows);
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

function isConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && ["23503", "23505"].includes(String(error.code));
}
