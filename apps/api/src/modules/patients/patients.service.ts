import type { CreatePatientInput, PatientDto, UpdatePatientInput } from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

interface PatientRow {
  id: string; firstName: string; lastName: string; middleName?: string; birthDate?: string;
  sex: "female" | "male" | "unknown"; phone: string; email?: string; notes?: string; createdAt: Date;
}

const patientSelect = `id, first_name AS "firstName", last_name AS "lastName", middle_name AS "middleName",
  birth_date AS "birthDate", sex, phone, email, notes, created_at AS "createdAt"`;

@Injectable()
export class PatientsService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  list(auth: AuthContext, query?: string): Promise<PatientDto[]> {
    return this.database.withTenant(auth, async (client) => {
      const search = query ? `%${query}%` : null;
      const result = await client.query<PatientRow>(`SELECT ${patientSelect} FROM patients WHERE archived_at IS NULL AND
        ($1::text IS NULL OR concat_ws(' ', last_name, first_name, middle_name) ILIKE $1 OR phone_normalized LIKE $2)
        ORDER BY last_name, first_name LIMIT 100`, [search, query ? `%${normalizePhone(query)}%` : null]);
      return result.rows.map(toDto);
    });
  }

  get(auth: AuthContext, id: string): Promise<PatientDto> {
    return this.database.withTenant(auth, async (client) => toDto(await this.find(client, id)));
  }

  create(auth: AuthContext, input: CreatePatientInput): Promise<PatientDto> {
    return this.database.withTenant(auth, async (client) => {
      const duplicate = await client.query<{ id: string }>(
        `SELECT id FROM patients WHERE phone_normalized=$1 AND archived_at IS NULL LIMIT 1`, [normalizePhone(input.phone)]);
      if (duplicate.rows[0]) {
        throw new ApiException(HttpStatus.CONFLICT, "POSSIBLE_PATIENT_DUPLICATE", "A patient with this phone already exists", {
          patientId: duplicate.rows[0].id
        });
      }
      const result = await client.query<PatientRow>(`INSERT INTO patients (tenant_id, first_name, last_name, middle_name,
        birth_date, sex, phone, phone_normalized, email, notes, created_by, updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING ${patientSelect}`,
        [auth.tenantId, input.firstName, input.lastName, input.middleName ?? null, input.birthDate ?? null,
          input.sex, input.phone, normalizePhone(input.phone), input.email ?? null, input.notes ?? null, auth.userId]);
      const patient = toDto(result.rows[0]!);
      await this.record(client, auth, "patient.created", "PatientCreated", patient);
      return patient;
    });
  }

  update(auth: AuthContext, id: string, input: UpdatePatientInput): Promise<PatientDto> {
    return this.database.withTenant(auth, async (client) => {
      const before = toDto(await this.find(client, id));
      const merged = { ...before, ...input };
      const phone = input.phone ?? before.phone;
      const result = await client.query<PatientRow>(`UPDATE patients SET first_name=$3, last_name=$4, middle_name=$5,
        birth_date=$6, sex=$7, phone=$8, phone_normalized=$9, email=$10, notes=$11,
        updated_at=now(), updated_by=$2, version=version+1 WHERE id=$1 RETURNING ${patientSelect}`,
        [id, auth.userId, merged.firstName, merged.lastName, merged.middleName ?? null, merged.birthDate ?? null,
          merged.sex, phone, normalizePhone(phone), merged.email ?? null, merged.notes ?? null]);
      const patient = toDto(result.rows[0]!);
      await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action: "patient.updated",
        entityType: "patient", entityId: id, before, after: patient, requestId: auth.requestId });
      await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: "patient", aggregateId: id,
        eventType: "PatientUpdated", payload: { patientId: id }, requestId: auth.requestId });
      return patient;
    });
  }

  private async find(client: PoolClient, id: string): Promise<PatientRow> {
    const row = (await client.query<PatientRow>(`SELECT ${patientSelect} FROM patients WHERE id=$1 AND archived_at IS NULL`, [id])).rows[0];
    if (!row) throw new ApiException(HttpStatus.NOT_FOUND, "PATIENT_NOT_FOUND", "Patient not found");
    return row;
  }

  private async record(client: PoolClient, auth: AuthContext, action: string, eventType: string, patient: PatientDto) {
    await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action,
      entityType: "patient", entityId: patient.id, after: patient, requestId: auth.requestId });
    await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: "patient", aggregateId: patient.id,
      eventType, payload: { patientId: patient.id }, requestId: auth.requestId });
  }
}

function normalizePhone(value: string): string { return value.replace(/\D/g, ""); }
function toDto(row: PatientRow): PatientDto {
  return { id: row.id, firstName: row.firstName, lastName: row.lastName, middleName: row.middleName,
    birthDate: row.birthDate, sex: row.sex, phone: row.phone, email: row.email, notes: row.notes,
    createdAt: row.createdAt.toISOString() };
}
