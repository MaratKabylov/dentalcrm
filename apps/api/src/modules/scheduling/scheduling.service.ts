import type {
  AppointmentDto, AppointmentStatus, CreateAppointmentInput, CreateScheduleShiftInput, RescheduleAppointmentInput
} from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { canTransition } from "./appointment-state.js";

interface AppointmentRow {
  id: string; patientId: string; doctorId: string; branchId: string; roomId: string | null; chairId: string | null;
  startsAt: Date; endsAt: Date; status: AppointmentStatus; source: string; reason: string | null; notes: string | null;
}

const select = `a.id, a.patient_id AS "patientId", a.doctor_id AS "doctorId", a.branch_id AS "branchId",
  a.room_id AS "roomId", a.chair_id AS "chairId", a.starts_at AS "startsAt", a.ends_at AS "endsAt",
  a.status, a.source, a.reason, a.notes`;

@Injectable()
export class SchedulingService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  list(auth: AuthContext, from: string, to: string): Promise<Array<AppointmentDto & Record<string, unknown>>> {
    if (Date.parse(to) - Date.parse(from) > 1000 * 60 * 60 * 24 * 62) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CALENDAR_RANGE_TOO_LARGE", "Calendar range cannot exceed 62 days");
    }
    return this.database.withTenant(auth, async (client) => {
      const result = await client.query<AppointmentRow & Record<string, unknown>>(`SELECT ${select},
        concat_ws(' ', p.last_name, p.first_name) AS "patientName",
        concat_ws(' ', e.last_name, e.first_name) AS "doctorName",
        c.name AS "chairName", r.name AS "roomName"
        FROM appointments a JOIN patients p ON p.tenant_id=a.tenant_id AND p.id=a.patient_id
        JOIN doctors d ON d.tenant_id=a.tenant_id AND d.id=a.doctor_id
        JOIN employees e ON e.tenant_id=d.tenant_id AND e.id=d.employee_id
        LEFT JOIN chairs c ON c.tenant_id=a.tenant_id AND c.id=a.chair_id
        LEFT JOIN rooms r ON r.tenant_id=a.tenant_id AND r.id=a.room_id
        WHERE a.starts_at < $2 AND a.ends_at > $1 ORDER BY a.starts_at`, [from, to]);
      return result.rows.map((row) => ({ ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() }));
    });
  }

  listShifts(auth: AuthContext, from: string, to: string) {
    return this.database.withTenant(auth, async (client) => (await client.query(
      `SELECT s.id, s.branch_id AS "branchId", s.doctor_id AS "doctorId", s.starts_at AS "startsAt",
       s.ends_at AS "endsAt", concat_ws(' ', e.last_name, e.first_name) AS "doctorName"
       FROM schedule_shifts s JOIN doctors d ON d.tenant_id=s.tenant_id AND d.id=s.doctor_id
       JOIN employees e ON e.tenant_id=d.tenant_id AND e.id=d.employee_id
       WHERE s.starts_at < $2 AND s.ends_at > $1 ORDER BY s.starts_at`, [from, to])).rows);
  }

  async createShift(auth: AuthContext, input: CreateScheduleShiftInput) {
    try {
      return await this.database.withTenant(auth, async (client) => {
        const shift = (await client.query<{ id: string } & Record<string, unknown>>(
          `INSERT INTO schedule_shifts (tenant_id, branch_id, doctor_id, starts_at, ends_at)
           VALUES ($1,$2,$3,$4,$5) RETURNING id, branch_id AS "branchId", doctor_id AS "doctorId",
           starts_at AS "startsAt", ends_at AS "endsAt"`,
          [auth.tenantId, input.branchId, input.doctorId, input.startsAt, input.endsAt])).rows[0]!;
        await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action: "schedule_shift.created",
          entityType: "schedule_shift", entityId: shift.id, after: shift, requestId: auth.requestId });
        await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: "schedule_shift", aggregateId: shift.id,
          eventType: "ScheduleShiftCreated", payload: { shiftId: shift.id }, requestId: auth.requestId });
        return shift;
      });
    } catch (error) {
      if (isDatabaseConflict(error)) {
        throw new ApiException(HttpStatus.CONFLICT, "SCHEDULE_SHIFT_CONFLICT", "Doctor already has a shift in this time range");
      }
      throw error;
    }
  }

  async create(auth: AuthContext, input: CreateAppointmentInput): Promise<AppointmentDto> {
    try {
      return await this.database.withTenant(auth, async (client) => {
        const result = await client.query<AppointmentRow>(`INSERT INTO appointments (tenant_id, patient_id, doctor_id,
          branch_id, room_id, chair_id, starts_at, ends_at, source, reason, notes, created_by, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING ${select.replaceAll("a.", "")}`,
          [auth.tenantId, input.patientId, input.doctorId, input.branchId, input.roomId ?? null, input.chairId ?? null,
            input.startsAt, input.endsAt, input.source, input.reason ?? null, input.notes ?? null, auth.userId]);
        const appointment = toDto(result.rows[0]!);
        for (const serviceId of new Set(input.serviceIds)) {
          await client.query(`INSERT INTO appointment_services (tenant_id, appointment_id, service_id) VALUES ($1,$2,$3)`,
            [auth.tenantId, appointment.id, serviceId]);
        }
        await client.query(`INSERT INTO appointment_status_events (tenant_id, appointment_id, from_status, to_status, actor_user_id)
          VALUES ($1,$2,NULL,'created',$3)`, [auth.tenantId, appointment.id, auth.userId]);
        await this.record(client, auth, "appointment.created", "AppointmentCreated", appointment);
        return appointment;
      });
    } catch (error) {
      if (isDatabaseConflict(error)) {
        throw new ApiException(HttpStatus.CONFLICT, "APPOINTMENT_CONFLICT", "Doctor, chair, or room is already occupied in this time range");
      }
      throw error;
    }
  }

  transition(auth: AuthContext, id: string, target: AppointmentStatus, reason?: string): Promise<AppointmentDto> {
    return this.database.withTenant(auth, async (client) => {
      const row = (await client.query<AppointmentRow>(`SELECT ${select} FROM appointments a WHERE a.id=$1 FOR UPDATE`, [id])).rows[0];
      if (!row) throw new ApiException(HttpStatus.NOT_FOUND, "APPOINTMENT_NOT_FOUND", "Appointment not found");
      if (!canTransition(row.status, target)) {
        throw new ApiException(HttpStatus.CONFLICT, "INVALID_APPOINTMENT_TRANSITION",
          `Cannot transition appointment from ${row.status} to ${target}`, { from: row.status, to: target });
      }
      if (target === "cancelled" && !reason?.trim()) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "CANCELLATION_REASON_REQUIRED", "Cancellation reason is required");
      }
      const updated = (await client.query<AppointmentRow>(`UPDATE appointments SET status=$2::varchar(32),
        reason=CASE WHEN $2::varchar(32)='cancelled' THEN $3 ELSE reason END, updated_at=now(), updated_by=$4, version=version+1
        WHERE id=$1 RETURNING ${select.replaceAll("a.", "")}`, [id, target, reason ?? null, auth.userId])).rows[0]!;
      await client.query(`INSERT INTO appointment_status_events (tenant_id, appointment_id, from_status, to_status, reason, actor_user_id)
        VALUES ($1,$2,$3,$4,$5,$6)`, [auth.tenantId, id, row.status, target, reason ?? null, auth.userId]);
      const appointment = toDto(updated);
      await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action: `appointment.${target}`,
        entityType: "appointment", entityId: id, before: toDto(row), after: appointment,
        ...(reason ? { reason } : {}), requestId: auth.requestId });
      await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: "appointment", aggregateId: id,
        eventType: `Appointment${eventSuffix(target)}`, payload: { appointmentId: id, status: target }, requestId: auth.requestId });
      return appointment;
    });
  }

  async reschedule(auth: AuthContext, id: string, input: RescheduleAppointmentInput) {
    try {
      return await this.database.withTenant(auth, async (client) => {
        const current = (await client.query<AppointmentRow>(`SELECT ${select} FROM appointments a WHERE a.id=$1 FOR UPDATE`, [id])).rows[0];
        if (!current) throw new ApiException(HttpStatus.NOT_FOUND, "APPOINTMENT_NOT_FOUND", "Appointment not found");
        if (!canTransition(current.status, "rescheduled")) {
          throw new ApiException(HttpStatus.CONFLICT, "INVALID_APPOINTMENT_TRANSITION",
            `Cannot reschedule appointment from ${current.status}`, { from: current.status, to: "rescheduled" });
        }
        await client.query(`UPDATE appointments SET status='rescheduled', reason=$2, updated_at=now(), updated_by=$3,
          version=version+1 WHERE id=$1`, [id, input.reason, auth.userId]);
        const created = (await client.query<AppointmentRow>(`INSERT INTO appointments (tenant_id, patient_id, doctor_id,
          branch_id, room_id, chair_id, starts_at, ends_at, source, reason, notes, created_by, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING ${select.replaceAll("a.", "")}`,
          [auth.tenantId, current.patientId, current.doctorId, current.branchId,
            input.roomId === undefined ? current.roomId : input.roomId,
            input.chairId === undefined ? current.chairId : input.chairId,
            input.startsAt, input.endsAt, current.source, current.reason, current.notes, auth.userId])).rows[0]!;
        await client.query(`INSERT INTO appointment_services (tenant_id, appointment_id, service_id)
          SELECT tenant_id, $2, service_id FROM appointment_services WHERE appointment_id=$1`, [id, created.id]);
        await client.query(`INSERT INTO appointment_status_events (tenant_id, appointment_id, from_status, to_status, reason, actor_user_id)
          VALUES ($1,$2,$3,'rescheduled',$4,$5), ($1,$6,NULL,'created',$4,$5)`,
          [auth.tenantId, id, current.status, input.reason, auth.userId, created.id]);
        const replacement = toDto(created);
        await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action: "appointment.rescheduled",
          entityType: "appointment", entityId: id, before: toDto(current), after: { replacementId: replacement.id },
          reason: input.reason, requestId: auth.requestId });
        await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: "appointment", aggregateId: id,
          eventType: "AppointmentRescheduled", payload: { appointmentId: id, replacementId: replacement.id }, requestId: auth.requestId });
        return { previousId: id, appointment: replacement };
      });
    } catch (error) {
      if (isDatabaseConflict(error)) {
        throw new ApiException(HttpStatus.CONFLICT, "APPOINTMENT_CONFLICT", "Doctor, chair, or room is already occupied in this time range");
      }
      throw error;
    }
  }

  private async record(client: PoolClient, auth: AuthContext, action: string, eventType: string, appointment: AppointmentDto) {
    await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action,
      entityType: "appointment", entityId: appointment.id, after: appointment, requestId: auth.requestId });
    await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: "appointment", aggregateId: appointment.id,
      eventType, payload: { appointmentId: appointment.id }, requestId: auth.requestId });
  }
}

function toDto(row: AppointmentRow): AppointmentDto {
  return { ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() };
}
function isDatabaseConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && ["23P01", "23503"].includes(String(error.code));
}
function eventSuffix(status: AppointmentStatus): string {
  return status.split("_").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
}
