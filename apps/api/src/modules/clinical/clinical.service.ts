import type {
  AmendClinicalNoteInput, CreateClinicalNoteInput, CreateDiagnosisInput, CreateEncounterInput,
  CreateProcedureInput, SetOdontogramEntryInput, UpdateClinicalNoteInput
} from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../identity/auth-context.js";
import { assertBranchAccess } from "../identity/access-scope.js";
import { OutboxService } from "../outbox/outbox.service.js";

export interface EncounterRow { id: string; appointmentId: string | null; patientId: string; doctorId: string; branchId: string; status: string; startedAt: Date; completedAt: Date | null }
export interface NoteRow { id: string; encounterId: string; patientId: string; doctorId: string; title: string; content: string; status: string; currentVersion: number; signedAt: Date | null }

const encounterSelect = `id, appointment_id AS "appointmentId", patient_id AS "patientId", doctor_id AS "doctorId",
  branch_id AS "branchId", status, started_at AS "startedAt", completed_at AS "completedAt"`;
const noteSelect = `id, encounter_id AS "encounterId", patient_id AS "patientId", doctor_id AS "doctorId", title,
  content, status, current_version AS "currentVersion", signed_at AS "signedAt"`;

@Injectable()
export class ClinicalService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  createEncounter(auth: AuthContext, input: CreateEncounterInput) {
    return this.database.withTenant(auth, async (client) => {
      await assertBranchAccess(client,auth,input.branchId);
      if (input.appointmentId) {
        const appointment = (await client.query<{ patientId: string; doctorId: string; branchId: string }>(
          `SELECT patient_id AS "patientId", doctor_id AS "doctorId", branch_id AS "branchId" FROM appointments WHERE id=$1`,
          [input.appointmentId])).rows[0];
        if (!appointment) throw new ApiException(HttpStatus.NOT_FOUND, "APPOINTMENT_NOT_FOUND", "Appointment not found");
        if (appointment.patientId !== input.patientId || appointment.doctorId !== input.doctorId || appointment.branchId !== input.branchId) {
          throw new ApiException(HttpStatus.CONFLICT, "ENCOUNTER_APPOINTMENT_MISMATCH", "Encounter does not match the appointment");
        }
      }
      const encounter = (await client.query<EncounterRow>(`INSERT INTO encounters
        (tenant_id, appointment_id, patient_id, doctor_id, branch_id, started_at, created_by, updated_by)
        VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,now()),$7,$7) RETURNING ${encounterSelect}`,
        [auth.tenantId, input.appointmentId ?? null, input.patientId, input.doctorId, input.branchId, input.startedAt ?? null, auth.userId])).rows[0]!;
      await this.record(client, auth, "encounter.started", "EncounterStarted", "encounter", encounter.id, encounter);
      return encounter;
    });
  }

  getEncounter(auth: AuthContext, id: string) {
    return this.database.withTenant(auth, async (client) => {
      const encounter = await this.findEncounter(client, id);
      await assertBranchAccess(client,auth,encounter.branchId);
      const [notes, diagnoses, procedures] = await Promise.all([
        client.query(`SELECT n.id,n.encounter_id AS "encounterId",n.patient_id AS "patientId",n.doctor_id AS "doctorId",
          COALESCE(v.title,n.title) AS title,COALESCE(v.content,n.content) AS content,n.status,
          n.current_version AS "currentVersion",n.signed_at AS "signedAt" FROM clinical_notes n
          LEFT JOIN clinical_note_versions v ON v.tenant_id=n.tenant_id AND v.clinical_note_id=n.id AND v.version_number=n.current_version
          WHERE n.encounter_id=$1 ORDER BY n.created_at`, [id]),
        client.query(`SELECT ed.id, d.code, d.name, ed.kind, ed.tooth_number AS "toothNumber", ed.recorded_at AS "recordedAt"
          FROM encounter_diagnoses ed JOIN diagnoses d ON d.tenant_id=ed.tenant_id AND d.id=ed.diagnosis_id
          WHERE ed.encounter_id=$1 ORDER BY ed.recorded_at`, [id]),
        client.query(`SELECT id, service_id AS "serviceId", doctor_id AS "doctorId", tooth_number AS "toothNumber",
          quantity, status, notes, completed_at AS "completedAt" FROM procedures WHERE encounter_id=$1 ORDER BY created_at`, [id])
      ]);
      return { ...encounter, notes: notes.rows, diagnoses: diagnoses.rows, procedures: procedures.rows };
    });
  }

  completeEncounter(auth: AuthContext, id: string) {
    return this.database.withTenant(auth, async (client) => {
      const before = await this.findEncounter(client, id, true);
      await assertBranchAccess(client,auth,before.branchId);
      if (before.status !== "in_progress") throw new ApiException(HttpStatus.CONFLICT, "ENCOUNTER_NOT_ACTIVE", "Encounter is not in progress");
      const signed = await client.query(`SELECT 1 FROM clinical_notes WHERE encounter_id=$1 AND status IN ('signed','amended') LIMIT 1`, [id]);
      if (!signed.rows[0]) throw new ApiException(HttpStatus.CONFLICT, "SIGNED_NOTE_REQUIRED", "A signed clinical note is required to complete the encounter");
      const after = (await client.query<EncounterRow>(`UPDATE encounters SET status='completed', completed_at=now(), completed_by=$2,
        updated_at=now(), updated_by=$2, version=version+1 WHERE id=$1 RETURNING ${encounterSelect}`, [id, auth.userId])).rows[0]!;
      await this.record(client, auth, "encounter.completed", "EncounterCompleted", "encounter", id, after, before);
      return after;
    });
  }

  createNote(auth: AuthContext, input: CreateClinicalNoteInput) {
    return this.database.withTenant(auth, async (client) => {
      const encounter = await this.findEncounter(client, input.encounterId, true);
      await assertBranchAccess(client,auth,encounter.branchId);
      if (encounter.status !== "in_progress") throw new ApiException(HttpStatus.CONFLICT, "ENCOUNTER_NOT_ACTIVE", "Encounter is not in progress");
      const note = (await client.query<NoteRow>(`INSERT INTO clinical_notes
        (tenant_id, encounter_id, patient_id, doctor_id, title, content, created_by, updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING ${noteSelect}`,
        [auth.tenantId, encounter.id, encounter.patientId, encounter.doctorId, input.title, input.content, auth.userId])).rows[0]!;
      await this.appendNoteVersion(client, auth, note, null);
      await this.record(client, auth, "clinical_note.created", "ClinicalNoteCreated", "clinical_note", note.id, note);
      return note;
    });
  }

  updateNote(auth: AuthContext, id: string, input: UpdateClinicalNoteInput) {
    return this.database.withTenant(auth, async (client) => {
      const before = await this.findNote(client, id, true);
      await this.assertNoteAccess(client,auth,before);
      if (before.status !== "draft") throw new ApiException(HttpStatus.CONFLICT, "SIGNED_NOTE_IMMUTABLE", "Signed clinical notes must be amended");
      const after = (await client.query<NoteRow>(`UPDATE clinical_notes SET title=COALESCE($2,title), content=COALESCE($3,content),
        current_version=current_version+1, updated_at=now(), updated_by=$4, version=version+1 WHERE id=$1 RETURNING ${noteSelect}`,
        [id, input.title ?? null, input.content ?? null, auth.userId])).rows[0]!;
      await this.appendNoteVersion(client, auth, after, null);
      await this.record(client, auth, "clinical_note.updated", "ClinicalNoteUpdated", "clinical_note", id, after, before);
      return after;
    });
  }

  signNote(auth: AuthContext, id: string) {
    return this.database.withTenant(auth, async (client) => {
      const before = await this.findNote(client, id, true);
      await this.assertNoteAccess(client,auth,before);
      if (before.status !== "draft") throw new ApiException(HttpStatus.CONFLICT, "CLINICAL_NOTE_NOT_DRAFT", "Only a draft note can be signed");
      const signedVersion = before.currentVersion + 1;
      await client.query(`INSERT INTO clinical_note_versions
        (tenant_id,clinical_note_id,version_number,title,content,author_user_id,signed_at)
        VALUES ($1,$2,$3,$4,$5,$6,now())`, [auth.tenantId, id, signedVersion, before.title, before.content, auth.userId]);
      const after = (await client.query<NoteRow>(`UPDATE clinical_notes SET status='signed', signed_at=now(), signed_by=$2,
        current_version=$3, updated_at=now(), updated_by=$2, version=version+1 WHERE id=$1 RETURNING ${noteSelect}`,
        [id, auth.userId, signedVersion])).rows[0]!;
      await this.record(client, auth, "clinical_note.signed", "ClinicalNoteSigned", "clinical_note", id, after, before);
      return after;
    });
  }

  amendNote(auth: AuthContext, id: string, input: AmendClinicalNoteInput) {
    return this.database.withTenant(auth, async (client) => {
      const note = await this.findNote(client, id, true);
      await this.assertNoteAccess(client,auth,note);
      if (!['signed','amended'].includes(note.status)) throw new ApiException(HttpStatus.CONFLICT, "SIGNED_NOTE_REQUIRED", "Only a signed note can be amended");
      const next = note.currentVersion + 1;
      await client.query(`INSERT INTO clinical_note_versions
        (tenant_id, clinical_note_id, version_number, title, content, author_user_id, amendment_reason, signed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,now())`, [auth.tenantId, id, next, note.title, input.content, auth.userId, input.reason]);
      const after = (await client.query<NoteRow>(`UPDATE clinical_notes SET status='amended', current_version=$2,
        updated_at=now(), updated_by=$3, version=version+1 WHERE id=$1 RETURNING ${noteSelect}`, [id, next, auth.userId])).rows[0]!;
      await this.record(client, auth, "clinical_note.amended", "ClinicalNoteAmended", "clinical_note", id,
        { ...after, content: input.content }, note, input.reason);
      return { ...after, content: input.content };
    });
  }

  noteVersions(auth: AuthContext, id: string) {
    return this.database.withTenant(auth, async (client) => {
      const note=await this.findNote(client,id);
      await this.assertNoteAccess(client,auth,note);
      return (await client.query(`SELECT id, version_number AS "versionNumber", title, content,
        amendment_reason AS "amendmentReason", created_at AS "createdAt", signed_at AS "signedAt"
        FROM clinical_note_versions WHERE clinical_note_id=$1 ORDER BY version_number DESC`, [id])).rows;
    });
  }

  addDiagnosis(auth: AuthContext, encounterId: string, input: CreateDiagnosisInput) {
    return this.database.withTenant(auth, async (client) => {
      const encounter=await this.assertActiveEncounter(client, encounterId);
      await assertBranchAccess(client,auth,encounter.branchId);
      const organization=(await client.query<{id:string}>(`SELECT organization_id AS id FROM branches WHERE id=$1`,[encounter.branchId])).rows[0]!;
      const diagnosis = (await client.query<{ id: string }>(`INSERT INTO diagnoses (tenant_id,organization_id,code,name) VALUES ($1,$2,$3,$4)
        ON CONFLICT (tenant_id,organization_id,code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [auth.tenantId,organization.id,input.code,input.name])).rows[0]!;
      const row = (await client.query<{ id: string } & Record<string, unknown>>(`INSERT INTO encounter_diagnoses
        (tenant_id,encounter_id,diagnosis_id,kind,tooth_number,recorded_by) VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id, encounter_id AS "encounterId", diagnosis_id AS "diagnosisId", kind, tooth_number AS "toothNumber", recorded_at AS "recordedAt"`,
        [auth.tenantId, encounterId, diagnosis.id, input.kind, input.toothNumber ?? null, auth.userId])).rows[0]!;
      await this.record(client, auth, "diagnosis.recorded", "DiagnosisRecorded", "encounter_diagnosis", row.id, { ...row, code: input.code, name: input.name });
      return { ...row, code: input.code, name: input.name };
    });
  }

  addProcedure(auth: AuthContext, encounterId: string, input: CreateProcedureInput) {
    return this.database.withTenant(auth, async (client) => {
      const encounter = await this.assertActiveEncounter(client, encounterId);
      await assertBranchAccess(client,auth,encounter.branchId);
      const validService=(await client.query(`SELECT 1 FROM services s JOIN branches b ON b.id=$2
        WHERE s.id=$1 AND s.organization_id=b.organization_id AND s.active`,[input.serviceId,encounter.branchId])).rows[0];
      if(!validService) throw new ApiException(HttpStatus.CONFLICT,"SERVICE_ORGANIZATION_MISMATCH","Service does not belong to the encounter organization");
      const row = (await client.query<{ id: string } & Record<string, unknown>>(`INSERT INTO procedures
        (tenant_id,encounter_id,patient_id,doctor_id,service_id,tooth_number,quantity,notes,created_by,updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id, encounter_id AS "encounterId", service_id AS "serviceId",
        doctor_id AS "doctorId", tooth_number AS "toothNumber", quantity, status, notes`,
        [auth.tenantId, encounterId, encounter.patientId, encounter.doctorId, input.serviceId, input.toothNumber ?? null,
          input.quantity, input.notes ?? null, auth.userId])).rows[0]!;
      await client.query(`INSERT INTO procedure_status_events (tenant_id,procedure_id,to_status,actor_user_id) VALUES ($1,$2,'planned',$3)`, [auth.tenantId, row.id, auth.userId]);
      if (input.treatmentPlanItemId) {
        const linked = await client.query(`INSERT INTO treatment_plan_item_executions (tenant_id,treatment_plan_item_id,procedure_id)
          SELECT $1,id,$3 FROM treatment_plan_items WHERE id=$2 AND service_id=$4 RETURNING id`,
          [auth.tenantId, input.treatmentPlanItemId, row.id, input.serviceId]);
        if (!linked.rows[0]) throw new ApiException(HttpStatus.CONFLICT, "TREATMENT_PLAN_ITEM_MISMATCH", "Treatment plan item does not match the procedure service");
      }
      await this.record(client, auth, "procedure.created", "ProcedureCreated", "procedure", row.id, row);
      return row;
    });
  }

  completeProcedure(auth: AuthContext, id: string, completedAt?: string) {
    return this.database.withTenant(auth, async (client) => {
      const before = (await client.query<{ id:string;status:string;branchId:string }>(`SELECT p.id,p.status,e.branch_id AS "branchId"
        FROM procedures p JOIN encounters e ON e.id=p.encounter_id WHERE p.id=$1 FOR UPDATE OF p`, [id])).rows[0];
      if (!before) throw new ApiException(HttpStatus.NOT_FOUND, "PROCEDURE_NOT_FOUND", "Procedure not found");
      await assertBranchAccess(client,auth,before.branchId);
      if (!['planned','in_progress'].includes(before.status)) throw new ApiException(HttpStatus.CONFLICT, "PROCEDURE_NOT_ACTIVE", "Procedure cannot be completed");
      const after = (await client.query<Record<string, unknown>>(`UPDATE procedures SET status='completed', completed_at=COALESCE($2::timestamptz,now()),
        updated_at=now(), updated_by=$3, version=version+1 WHERE id=$1 RETURNING id,status,completed_at AS "completedAt"`,
        [id, completedAt ?? null, auth.userId])).rows[0]!;
      await client.query(`INSERT INTO procedure_status_events (tenant_id,procedure_id,from_status,to_status,actor_user_id)
        VALUES ($1,$2,$3,'completed',$4)`, [auth.tenantId, id, before.status, auth.userId]);
      await client.query(`UPDATE treatment_plan_items SET status='completed' WHERE id IN
        (SELECT treatment_plan_item_id FROM treatment_plan_item_executions WHERE procedure_id=$1)`, [id]);
      await client.query(`UPDATE treatment_plans tp SET status=CASE WHEN NOT EXISTS
        (SELECT 1 FROM treatment_plan_items i WHERE i.treatment_plan_id=tp.id AND i.status NOT IN ('completed','rejected','cancelled'))
        THEN 'completed' ELSE 'in_progress' END,updated_at=now(),updated_by=$2,version=version+1
        WHERE tp.id IN (SELECT i.treatment_plan_id FROM treatment_plan_items i JOIN treatment_plan_item_executions x
          ON x.tenant_id=i.tenant_id AND x.treatment_plan_item_id=i.id WHERE x.procedure_id=$1)`, [id, auth.userId]);
      await this.record(client, auth, "procedure.completed", "ProcedureCompleted", "procedure", id, after, before);
      return after;
    });
  }

  getOdontogram(auth: AuthContext, patientId: string) {
    return this.database.withTenant(auth, async (client) => {
      const patient = await client.query(`SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL`, [patientId]);
      if (!patient.rows[0]) throw new ApiException(HttpStatus.NOT_FOUND, "PATIENT_NOT_FOUND", "Patient not found");
      const entries = await client.query(`SELECT oe.id, oe.tooth_number AS "toothNumber", oe.surface, oe.condition_code AS "conditionCode",
        oe.status, oe.encounter_id AS "encounterId", oe.doctor_id AS "doctorId", oe.observed_at AS "observedAt",
        oe.current_version AS "currentVersion" FROM odontogram_entries oe WHERE oe.patient_id=$1 ORDER BY oe.tooth_number,oe.surface`, [patientId]);
      const history = await client.query(`SELECT oe.tooth_number AS "toothNumber",oe.surface,v.version_number AS "versionNumber",
        v.condition_code AS "conditionCode",v.status,v.encounter_id AS "encounterId",v.doctor_id AS "doctorId",
        v.observed_at AS "observedAt",v.created_at AS "recordedAt" FROM odontogram_entry_versions v
        JOIN odontogram_entries oe ON oe.tenant_id=v.tenant_id AND oe.id=v.odontogram_entry_id
        WHERE oe.patient_id=$1 ORDER BY oe.tooth_number,oe.surface,v.version_number DESC`, [patientId]);
      return { patientId, entries: entries.rows, history: history.rows };
    });
  }

  setOdontogramEntry(auth: AuthContext, patientId: string, input: SetOdontogramEntryInput) {
    return this.database.withTenant(auth, async (client) => {
      const patient = await client.query(`SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL`, [patientId]);
      if (!patient.rows[0]) throw new ApiException(HttpStatus.NOT_FOUND, "PATIENT_NOT_FOUND", "Patient not found");
      if (input.encounterId) await this.assertActiveEncounter(client, input.encounterId);
      const odontogram = (await client.query<{ id: string }>(`INSERT INTO odontograms (tenant_id,patient_id) VALUES ($1,$2)
        ON CONFLICT (tenant_id,patient_id) DO UPDATE SET updated_at=now(),version=odontograms.version+1 RETURNING id`, [auth.tenantId, patientId])).rows[0]!;
      const entry = (await client.query<{ id: string; currentVersion: number } & Record<string, unknown>>(`INSERT INTO odontogram_entries
        (tenant_id,odontogram_id,patient_id,tooth_number,surface,condition_code,status,encounter_id,doctor_id,observed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,now()))
        ON CONFLICT (tenant_id,odontogram_id,tooth_number,surface) DO UPDATE SET condition_code=EXCLUDED.condition_code,
        status=EXCLUDED.status,encounter_id=EXCLUDED.encounter_id,doctor_id=EXCLUDED.doctor_id,observed_at=EXCLUDED.observed_at,
        updated_at=now(),current_version=odontogram_entries.current_version+1
        RETURNING id,current_version AS "currentVersion",tooth_number AS "toothNumber",surface,condition_code AS "conditionCode",
        status,encounter_id AS "encounterId",doctor_id AS "doctorId",observed_at AS "observedAt"`,
        [auth.tenantId, odontogram.id, patientId, input.toothNumber, input.surface, input.conditionCode, input.status,
          input.encounterId ?? null, input.doctorId, input.observedAt ?? null])).rows[0]!;
      await client.query(`INSERT INTO odontogram_entry_versions
        (tenant_id,odontogram_entry_id,version_number,condition_code,status,encounter_id,doctor_id,observed_at,author_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [auth.tenantId, entry.id, entry.currentVersion, input.conditionCode,
        input.status, input.encounterId ?? null, input.doctorId, entry.observedAt, auth.userId]);
      await this.record(client, auth, "odontogram_entry.recorded", "OdontogramEntryRecorded", "odontogram_entry", entry.id, entry);
      return entry;
    });
  }

  private async findEncounter(client: PoolClient, id: string, lock = false): Promise<EncounterRow> {
    const row = (await client.query<EncounterRow>(`SELECT ${encounterSelect} FROM encounters WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id])).rows[0];
    if (!row) throw new ApiException(HttpStatus.NOT_FOUND, "ENCOUNTER_NOT_FOUND", "Encounter not found");
    return row;
  }

  private async assertActiveEncounter(client: PoolClient, id: string): Promise<EncounterRow> {
    const encounter = await this.findEncounter(client, id, true);
    if (encounter.status !== "in_progress") throw new ApiException(HttpStatus.CONFLICT, "ENCOUNTER_NOT_ACTIVE", "Encounter is not in progress");
    return encounter;
  }

  private async findNote(client: PoolClient, id: string, lock = false): Promise<NoteRow> {
    const row = (await client.query<NoteRow>(`SELECT ${noteSelect} FROM clinical_notes WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id])).rows[0];
    if (!row) throw new ApiException(HttpStatus.NOT_FOUND, "CLINICAL_NOTE_NOT_FOUND", "Clinical note not found");
    return row;
  }

  private async assertNoteAccess(client:PoolClient,auth:AuthContext,note:NoteRow){
    const encounter=await this.findEncounter(client,note.encounterId);
    await assertBranchAccess(client,auth,encounter.branchId);
  }

  private appendNoteVersion(client: PoolClient, auth: AuthContext, note: NoteRow, reason: string | null) {
    return client.query(`INSERT INTO clinical_note_versions
      (tenant_id,clinical_note_id,version_number,title,content,author_user_id,amendment_reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [auth.tenantId, note.id, note.currentVersion, note.title, note.content, auth.userId, reason]);
  }

  private async record(client: PoolClient, auth: AuthContext, action: string, eventType: string, entityType: string,
    entityId: string, after: unknown, before?: unknown, reason?: string) {
    await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action, entityType, entityId,
      ...(before === undefined ? {} : { before }), after, ...(reason === undefined ? {} : { reason }), requestId: auth.requestId });
    await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: entityType, aggregateId: entityId,
      eventType, payload: { [`${entityType}Id`]: entityId }, requestId: auth.requestId });
  }
}
