import type { AcceptTreatmentPlanInput, CreateTreatmentPlanInput } from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

export interface PlanRow { id: string; patientId: string; title: string; status: string; currency: string; currentVersion: number; createdAt: Date }
const planSelect = `id,patient_id AS "patientId",title,status,currency,current_version AS "currentVersion",created_at AS "createdAt"`;

@Injectable()
export class TreatmentPlansService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  create(auth: AuthContext, input: CreateTreatmentPlanInput) {
    return this.database.withTenant(auth, async (client) => {
      const patient = await client.query(`SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL`, [input.patientId]);
      if (!patient.rows[0]) throw new ApiException(HttpStatus.NOT_FOUND, "PATIENT_NOT_FOUND", "Patient not found");
      const plan = (await client.query<PlanRow>(`INSERT INTO treatment_plans
        (tenant_id,patient_id,title,currency,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$5) RETURNING ${planSelect}`,
        [auth.tenantId, input.patientId, input.title, input.currency.toUpperCase(), auth.userId])).rows[0]!;
      const items = [];
      for (const [position, item] of input.items.entries()) {
        const row = (await client.query<Record<string, unknown>>(`INSERT INTO treatment_plan_items
          (tenant_id,treatment_plan_id,service_id,doctor_id,tooth_number,quantity,list_price_minor,discount_minor,final_price_minor,position)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,service_id AS "serviceId",doctor_id AS "doctorId",
          tooth_number AS "toothNumber",quantity,list_price_minor AS "listPriceMinor",discount_minor AS "discountMinor",
          final_price_minor AS "finalPriceMinor",status,position`, [auth.tenantId, plan.id, item.serviceId, item.doctorId ?? null,
          item.toothNumber ?? null, item.quantity, item.listPriceMinor, item.discountMinor, item.finalPriceMinor, position])).rows[0]!;
        items.push(row);
      }
      const snapshot = { ...plan, items };
      await this.appendVersion(client, auth, plan.id, 1, snapshot);
      await this.record(client, auth, "treatment_plan.created", "TreatmentPlanCreated", plan.id, snapshot);
      return snapshot;
    });
  }

  get(auth: AuthContext, id: string) {
    return this.database.withTenant(auth, async (client) => this.aggregate(client, id));
  }

  present(auth: AuthContext, id: string) {
    return this.database.withTenant(auth, async (client) => {
      const plan = await this.find(client, id, true);
      if (plan.status !== "draft") throw new ApiException(HttpStatus.CONFLICT, "TREATMENT_PLAN_NOT_DRAFT", "Only a draft plan can be presented");
      const snapshot = await this.aggregate(client, id);
      const presentedVersion = plan.currentVersion + 1;
      const presentedSnapshot = { ...snapshot, status: "presented", currentVersion: presentedVersion };
      await this.appendVersion(client, auth, id, presentedVersion, presentedSnapshot);
      await client.query(`INSERT INTO treatment_plan_presentations (tenant_id,treatment_plan_id,version_number,presented_by)
        VALUES ($1,$2,$3,$4)`, [auth.tenantId, id, presentedVersion, auth.userId]);
      await client.query(`UPDATE treatment_plans SET status='presented',current_version=$3,updated_at=now(),updated_by=$2,
        version=version+1 WHERE id=$1`, [id, auth.userId, presentedVersion]);
      const after = presentedSnapshot;
      await this.record(client, auth, "treatment_plan.presented", "TreatmentPlanPresented", id, after, snapshot);
      return after;
    });
  }

  accept(auth: AuthContext, id: string, input: AcceptTreatmentPlanInput) {
    return this.database.withTenant(auth, async (client) => {
      const before = await this.find(client, id, true);
      if (!["presented","partially_accepted"].includes(before.status)) {
        throw new ApiException(HttpStatus.CONFLICT, "TREATMENT_PLAN_NOT_PRESENTED", "Treatment plan must be presented before acceptance");
      }
      const uniqueIds = [...new Set(input.itemIds)];
      const selected = await client.query<{ id: string }>(`SELECT id FROM treatment_plan_items
        WHERE treatment_plan_id=$1 AND id=ANY($2::uuid[]) AND status IN ('proposed','accepted')`, [id, uniqueIds]);
      if (selected.rowCount !== uniqueIds.length) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TREATMENT_PLAN_ITEMS", "One or more items do not belong to the plan");
      for (const itemId of uniqueIds) {
        await client.query(`INSERT INTO treatment_plan_acceptances
          (tenant_id,treatment_plan_id,treatment_plan_item_id,accepted_by,recorded_by) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (tenant_id,treatment_plan_item_id) DO NOTHING`, [auth.tenantId, id, itemId, input.acceptedBy, auth.userId]);
      }
      await client.query(`UPDATE treatment_plan_items SET status='accepted' WHERE treatment_plan_id=$1 AND id=ANY($2::uuid[])`, [id, uniqueIds]);
      const counts = (await client.query<{ total: number; accepted: number }>(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status='accepted')::int AS accepted FROM treatment_plan_items WHERE treatment_plan_id=$1`, [id])).rows[0]!;
      const status = counts.accepted === counts.total ? "accepted" : "partially_accepted";
      await client.query(`UPDATE treatment_plans SET status=$2,updated_at=now(),updated_by=$3,version=version+1 WHERE id=$1`, [id, status, auth.userId]);
      const after = await this.aggregate(client, id);
      await this.record(client, auth, "treatment_plan.accepted", "TreatmentPlanAccepted", id, after, before);
      return after;
    });
  }

  private async aggregate(client: PoolClient, id: string) {
    const plan = await this.find(client, id);
    const items = (await client.query(`SELECT id,service_id AS "serviceId",doctor_id AS "doctorId",tooth_number AS "toothNumber",
      quantity,list_price_minor::int AS "listPriceMinor",discount_minor::int AS "discountMinor",final_price_minor::int AS "finalPriceMinor",
      status,position FROM treatment_plan_items WHERE treatment_plan_id=$1 ORDER BY position`, [id])).rows;
    const totals = items.reduce((result, item) => {
      const value = Number(item.finalPriceMinor);
      result.proposedAmountMinor += value;
      if (["accepted","completed"].includes(String(item.status))) result.acceptedAmountMinor += value;
      if (item.status === "completed") result.realizedAmountMinor += value;
      return result;
    }, { proposedAmountMinor: 0, acceptedAmountMinor: 0, realizedAmountMinor: 0 });
    return { ...plan, items, ...totals };
  }

  private async find(client: PoolClient, id: string, lock = false): Promise<PlanRow> {
    const row = (await client.query<PlanRow>(`SELECT ${planSelect} FROM treatment_plans WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id])).rows[0];
    if (!row) throw new ApiException(HttpStatus.NOT_FOUND, "TREATMENT_PLAN_NOT_FOUND", "Treatment plan not found");
    return row;
  }

  private appendVersion(client: PoolClient, auth: AuthContext, id: string, version: number, snapshot: unknown) {
    return client.query(`INSERT INTO treatment_plan_versions (tenant_id,treatment_plan_id,version_number,snapshot,author_user_id)
      VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT (tenant_id,treatment_plan_id,version_number) DO NOTHING`,
      [auth.tenantId, id, version, JSON.stringify(snapshot), auth.userId]);
  }

  private async record(client: PoolClient, auth: AuthContext, action: string, eventType: string, id: string, after: unknown, before?: unknown) {
    await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action, entityType: "treatment_plan",
      entityId: id, ...(before === undefined ? {} : { before }), after, requestId: auth.requestId });
    await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: "treatment_plan", aggregateId: id,
      eventType, payload: { treatmentPlanId: id }, requestId: auth.requestId });
  }
}
