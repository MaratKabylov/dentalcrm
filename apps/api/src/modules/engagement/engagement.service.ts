import { createHash } from "node:crypto";
import type { CreateRecallTypeInput, CreateWaitlistEntryInput, RecallAttemptInput } from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertBranchAccess, assertOrganizationAccess, organizationScopeSql, scopeValues } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

interface OfferRow {
  id: string; organizationId: string; entryId: string; sourceAppointmentId: string; patientId: string;
  branchId: string; doctorId: string; roomId: string | null; chairId: string | null;
  startsAt: Date; endsAt: Date; expiresAt: Date; status: string;
}

@Injectable()
export class EngagementService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  listRecallTypes(auth: AuthContext) {
    const scope = this.scope(auth, "r");
    return this.database.withTenant(auth, async (client) => (await client.query(`SELECT r.id,r.organization_id AS "organizationId",
      r.code,r.name,r.service_id AS "serviceId",s.name AS "serviceName",r.interval_days AS "intervalDays",r.active,r.version
      FROM recall_types r LEFT JOIN services s ON s.id=r.service_id WHERE r.archived_at IS NULL AND ${scope.sql}
      ORDER BY r.name`, scope.values)).rows);
  }

  createRecallType(auth: AuthContext, input: CreateRecallTypeInput) {
    return this.database.withTenant(auth, async (client) => {
      await assertOrganizationAccess(client, auth, input.organizationId);
      const row = (await client.query<{id:string} & Record<string, unknown>>(`INSERT INTO recall_types
        (tenant_id,organization_id,code,name,service_id,interval_days,active,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,organization_id AS "organizationId",code,name,
        service_id AS "serviceId",interval_days AS "intervalDays",active,version`,
        [auth.tenantId,input.organizationId,input.code,input.name,input.serviceId ?? null,input.intervalDays,input.active,auth.userId])).rows[0]!;
      await this.record(client, auth, "recall_type.created", "RecallTypeCreated", "recall_type", row.id, row, input.organizationId);
      return row;
    });
  }

  listRecalls(auth: AuthContext, status?: string) {
    const allowed = ["scheduled","due","contacted","booked","completed","cancelled"];
    if (status && !allowed.includes(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_RECALL_STATUS","Recall status is invalid");
    const updateScope=this.operationalScope(auth,"r"),scope = this.operationalScope(auth, "r", 2, 3);
    return this.database.withTenant(auth, async (client) => {
      await client.query(`UPDATE recalls r SET status='due',updated_at=now(),version=version+1
        WHERE status='scheduled' AND due_on<=current_date AND ${updateScope.sql}`,updateScope.values);
      return (await client.query(`SELECT r.id,r.organization_id AS "organizationId",r.branch_id AS "branchId",r.patient_id AS "patientId",
        concat_ws(' ',p.last_name,p.first_name) AS "patientName",r.recall_type_id AS "recallTypeId",t.name AS "recallTypeName",
        r.source_appointment_id AS "sourceAppointmentId",r.due_on AS "dueOn",r.status,r.booked_appointment_id AS "bookedAppointmentId",
        r.created_at AS "createdAt" FROM recalls r JOIN patients p ON p.id=r.patient_id JOIN recall_types t ON t.id=r.recall_type_id
        WHERE ($1::varchar IS NULL OR r.status=$1) AND ${scope.sql} ORDER BY r.due_on,r.created_at`, [status ?? null,...scope.values])).rows;
    });
  }

  recordRecallAttempt(auth: AuthContext, id: string, input: RecallAttemptInput) {
    return this.database.withTenant(auth, async (client) => {
      const recall = (await client.query<{organizationId:string;branchId:string|null;patientId:string;status:string}>(`SELECT organization_id AS "organizationId",
        branch_id AS "branchId",patient_id AS "patientId",status FROM recalls WHERE id=$1 FOR UPDATE`,[id])).rows[0];
      if (!recall) throw new ApiException(HttpStatus.NOT_FOUND,"RECALL_NOT_FOUND","Recall not found");
      if(recall.branchId)await assertBranchAccess(client,auth,recall.branchId);else await assertOrganizationAccess(client,auth,recall.organizationId,false);
      if (["completed","cancelled"].includes(recall.status)) throw new ApiException(HttpStatus.CONFLICT,"RECALL_CLOSED","Recall is already closed");
      if (input.appointmentId) {
        const valid=(await client.query(`SELECT 1 FROM appointments a JOIN branches b ON b.id=a.branch_id
          WHERE a.id=$1 AND a.patient_id=$2 AND b.organization_id=$3`,[input.appointmentId,recall.patientId,recall.organizationId])).rows[0];
        if(!valid) throw new ApiException(HttpStatus.CONFLICT,"RECALL_APPOINTMENT_MISMATCH","Appointment is outside the recall patient or organization");
      }
      const attempt=(await client.query<{id:string} & Record<string,unknown>>(`INSERT INTO recall_attempts
        (tenant_id,organization_id,recall_id,channel,outcome,notes,appointment_id,attempted_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,channel,outcome,notes,appointment_id AS "appointmentId",attempted_at AS "attemptedAt"`,
        [auth.tenantId,recall.organizationId,id,input.channel,input.outcome,input.notes ?? null,input.appointmentId ?? null,auth.userId])).rows[0]!;
      const next=input.outcome==="booked"?"booked":"contacted";
      await client.query(`UPDATE recalls SET status=$2,booked_appointment_id=$3,updated_at=now(),updated_by=$4,version=version+1 WHERE id=$1`,
        [id,next,input.appointmentId ?? null,auth.userId]);
      await this.record(client,auth,"recall.attempted","RecallContacted","recall",id,{...attempt,status:next},recall.organizationId);
      return {...attempt,status:next};
    });
  }

  listWaitlistEntries(auth: AuthContext, status?: string) {
    const allowed=["active","booked","cancelled","expired"];
    if(status && !allowed.includes(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_WAITLIST_STATUS","Waitlist status is invalid");
    const updateScope=this.scope(auth,"w"),scope=this.scope(auth,"w",2,3);
    return this.database.withTenant(auth,async(client)=>{
      await client.query(`UPDATE waitlist_entries w SET status='expired',updated_at=now(),version=version+1
        WHERE status='active' AND date_to<current_date AND ${updateScope.sql}`,updateScope.values);
      return (await client.query(`SELECT w.id,w.organization_id AS "organizationId",w.patient_id AS "patientId",
        concat_ws(' ',p.last_name,p.first_name) AS "patientName",w.status,w.date_from AS "dateFrom",w.date_to AS "dateTo",
        w.desired_duration_minutes AS "desiredDurationMinutes",w.minimum_notice_minutes AS "minimumNoticeMinutes",w.priority,w.notes,
        COALESCE(json_agg(jsonb_build_object('kind',pref.kind,'doctorId',pref.doctor_id,'specialty',pref.specialty,'branchId',pref.branch_id,
          'weekday',pref.weekday,'startsAt',pref.starts_at,'endsAt',pref.ends_at)) FILTER(WHERE pref.id IS NOT NULL),'[]') AS preferences
        FROM waitlist_entries w JOIN patients p ON p.id=w.patient_id LEFT JOIN waitlist_preferences pref ON pref.waitlist_entry_id=w.id
        WHERE ($1::varchar IS NULL OR w.status=$1) AND ${scope.sql} GROUP BY w.id,p.last_name,p.first_name ORDER BY w.priority DESC,w.created_at`,
        [status ?? null,...scope.values])).rows;
    });
  }

  createWaitlistEntry(auth: AuthContext, input: CreateWaitlistEntryInput) {
    return this.database.withTenant(auth,async(client)=>{
      await assertOrganizationAccess(client,auth,input.organizationId);
      await this.assertWaitlistPreferences(client,input);
      const row=(await client.query<{id:string} & Record<string,unknown>>(`INSERT INTO waitlist_entries
        (tenant_id,organization_id,patient_id,date_from,date_to,desired_duration_minutes,minimum_notice_minutes,priority,notes,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id,organization_id AS "organizationId",patient_id AS "patientId",
        status,date_from AS "dateFrom",date_to AS "dateTo",desired_duration_minutes AS "desiredDurationMinutes",
        minimum_notice_minutes AS "minimumNoticeMinutes",priority,notes,version`,
        [auth.tenantId,input.organizationId,input.patientId,input.dateFrom,input.dateTo,input.desiredDurationMinutes,
          input.minimumNoticeMinutes,input.priority,input.notes ?? null,auth.userId])).rows[0]!;
      for(const doctorId of new Set(input.doctorIds)) await this.insertPreference(client,auth.tenantId,input.organizationId,row.id,"doctor",doctorId);
      for(const specialty of new Set(input.specialties)) await this.insertPreference(client,auth.tenantId,input.organizationId,row.id,"specialty",specialty);
      for(const branchId of new Set(input.branchIds)) await this.insertPreference(client,auth.tenantId,input.organizationId,row.id,"branch",branchId);
      for(const weekday of new Set(input.weekdays)) await this.insertPreference(client,auth.tenantId,input.organizationId,row.id,"weekday",weekday);
      for(const range of input.timeRanges) await client.query(`INSERT INTO waitlist_preferences
        (tenant_id,organization_id,waitlist_entry_id,kind,starts_at,ends_at) VALUES($1,$2,$3,'time_range',$4,$5)`,
        [auth.tenantId,input.organizationId,row.id,range.startsAt,range.endsAt]);
      const preferences={doctorIds:input.doctorIds,specialties:input.specialties,branchIds:input.branchIds,weekdays:input.weekdays,timeRanges:input.timeRanges};
      await this.record(client,auth,"waitlist_entry.created","WaitlistEntryCreated","waitlist_entry",row.id,{...row,preferences},input.organizationId);
      return {...row,preferences};
    });
  }

  cancelWaitlistEntry(auth:AuthContext,id:string,reason:string){return this.database.withTenant(auth,async(client)=>{
    const row=(await client.query<{organizationId:string;status:string}>(`SELECT organization_id AS "organizationId",status FROM waitlist_entries
      WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!row)throw new ApiException(HttpStatus.NOT_FOUND,"WAITLIST_ENTRY_NOT_FOUND","Waitlist entry not found");
    await assertOrganizationAccess(client,auth,row.organizationId);if(row.status!=="active")throw new ApiException(HttpStatus.CONFLICT,
      "WAITLIST_ENTRY_CLOSED","Only an active waitlist entry can be cancelled");
    const after=(await client.query(`UPDATE waitlist_entries SET status='cancelled',cancelled_reason=$2,updated_at=now(),updated_by=$3,
      version=version+1 WHERE id=$1 RETURNING id,status,version`,[id,reason,auth.userId])).rows[0]!;
    await client.query(`UPDATE waitlist_offers SET status='superseded',responded_at=now() WHERE waitlist_entry_id=$1 AND status='pending'`,[id]);
    await this.record(client,auth,"waitlist_entry.cancelled","WaitlistEntryCancelled","waitlist_entry",id,after,row.organizationId,reason);return after;
  });}

  listOffers(auth:AuthContext,status?:string){const allowed=["pending","accepted","declined","expired","superseded"];
    if(status && !allowed.includes(status))throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_OFFER_STATUS","Offer status is invalid");
    const updateScope=this.operationalScope(auth,"o"),scope=this.operationalScope(auth,"o",2,3);return this.database.withTenant(auth,async(client)=>{
      await client.query(`UPDATE waitlist_offers o SET status='expired',responded_at=now()
        WHERE status='pending' AND expires_at<=now() AND ${updateScope.sql}`,updateScope.values);
      return (await client.query(`SELECT o.id,o.organization_id AS "organizationId",o.waitlist_entry_id AS "waitlistEntryId",
        o.source_appointment_id AS "sourceAppointmentId",o.patient_id AS "patientId",o.branch_id AS "branchId",o.doctor_id AS "doctorId",
        o.starts_at AS "startsAt",o.ends_at AS "endsAt",o.status,o.expires_at AS "expiresAt",o.appointment_id AS "appointmentId"
        FROM waitlist_offers o WHERE ($1::varchar IS NULL OR o.status=$1) AND ${scope.sql} ORDER BY o.created_at DESC`,
        [status ?? null,...scope.values])).rows;});}

  async getPublicOffer(token:string){const parsed=this.parsePublicToken(token);return this.database.withTenant({tenantId:parsed.tenantId,requestId:"public-waitlist"},
    async(client)=>{const offer=await this.findOffer(client,parsed.hash,false);if(!offer)throw new ApiException(HttpStatus.NOT_FOUND,"WAITLIST_OFFER_NOT_FOUND","Offer not found");
      return this.publicView(client,offer);});}

  async acceptPublicOffer(token:string){const parsed=this.parsePublicToken(token);try{return await this.database.withTenant(
    {tenantId:parsed.tenantId,requestId:"public-waitlist"},async(client)=>{const offer=await this.findOffer(client,parsed.hash,true);
      if(!offer)throw new ApiException(HttpStatus.NOT_FOUND,"WAITLIST_OFFER_NOT_FOUND","Offer not found");this.assertOfferPending(offer);
      const source=(await client.query<{reason:string|null;notes:string|null}>(`SELECT reason,notes FROM appointments WHERE id=$1 AND status='cancelled' FOR UPDATE`,
        [offer.sourceAppointmentId])).rows[0];if(!source)throw new ApiException(HttpStatus.CONFLICT,"WAITLIST_SLOT_UNAVAILABLE","The offered slot is no longer available");
      const appointment=(await client.query<{id:string}>(`INSERT INTO appointments(tenant_id,patient_id,doctor_id,branch_id,room_id,chair_id,
        starts_at,ends_at,status,source,reason,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'created','web','Waitlist self-booking',$9) RETURNING id`,
        [parsed.tenantId,offer.patientId,offer.doctorId,offer.branchId,offer.roomId,offer.chairId,offer.startsAt,offer.endsAt,source.notes])).rows[0]!;
      await client.query(`INSERT INTO appointment_services(tenant_id,appointment_id,service_id)
        SELECT tenant_id,$2,service_id FROM appointment_services WHERE appointment_id=$1`,[offer.sourceAppointmentId,appointment.id]);
      await client.query(`INSERT INTO appointment_status_events(tenant_id,appointment_id,from_status,to_status)
        VALUES($1,$2,NULL,'created')`,[parsed.tenantId,appointment.id]);
      await client.query(`UPDATE waitlist_offers SET status='accepted',responded_at=now(),appointment_id=$2 WHERE id=$1`,[offer.id,appointment.id]);
      await client.query(`UPDATE waitlist_offers SET status='superseded',responded_at=now() WHERE source_appointment_id=$1 AND id<>$2 AND status='pending'`,
        [offer.sourceAppointmentId,offer.id]);
      await client.query(`UPDATE waitlist_entries SET status='booked',updated_at=now(),version=version+1 WHERE id=$1`,[offer.entryId]);
      await this.audit.append(client,{tenantId:parsed.tenantId,actorUserId:null,action:"waitlist_offer.accepted",entityType:"waitlist_offer",entityId:offer.id,
        after:{appointmentId:appointment.id},requestId:"public-waitlist"});
      await this.outbox.append(client,{tenantId:parsed.tenantId,aggregateType:"appointment",aggregateId:appointment.id,eventType:"AppointmentCreated",
        payload:{appointmentId:appointment.id,organizationId:offer.organizationId,branchId:offer.branchId,patientId:offer.patientId,source:"waitlist"},
        requestId:"public-waitlist"});return {status:"accepted",appointmentId:appointment.id};});
    }catch(error){if(isDatabaseConflict(error))throw new ApiException(HttpStatus.CONFLICT,"WAITLIST_SLOT_UNAVAILABLE","The offered slot was already booked");throw error;}}

  async declinePublicOffer(token:string){const parsed=this.parsePublicToken(token);return this.database.withTenant({tenantId:parsed.tenantId,requestId:"public-waitlist"},
    async(client)=>{const offer=await this.findOffer(client,parsed.hash,true);if(!offer)throw new ApiException(HttpStatus.NOT_FOUND,"WAITLIST_OFFER_NOT_FOUND","Offer not found");
      this.assertOfferPending(offer);await client.query("UPDATE waitlist_offers SET status='declined',responded_at=now() WHERE id=$1",[offer.id]);
      return {status:"declined"};});}

  private scope(auth:AuthContext,alias:string,organizationParam=1,branchParam=2){return auth.tenantWide?{sql:"TRUE",values:[] as unknown[]}:
    {sql:organizationScopeSql(alias,organizationParam,branchParam),values:scopeValues(auth)};}
  private operationalScope(auth:AuthContext,alias:string,organizationParam=1,branchParam=2){return auth.tenantWide?{sql:"TRUE",values:[] as unknown[]}:
    {sql:`(${alias}.organization_id=ANY($${organizationParam}::uuid[]) OR ${alias}.branch_id=ANY($${branchParam}::uuid[]))`,values:scopeValues(auth)};}
  private async assertWaitlistPreferences(client:PoolClient,input:CreateWaitlistEntryInput){
    if(input.branchIds.length){const count=(await client.query<{count:number}>(`SELECT count(*)::int AS count FROM branches WHERE id=ANY($1::uuid[])
      AND organization_id=$2 AND archived_at IS NULL`,[[...new Set(input.branchIds)],input.organizationId])).rows[0]?.count ?? 0;
      if(count!==new Set(input.branchIds).size)throw new ApiException(HttpStatus.CONFLICT,"WAITLIST_BRANCH_MISMATCH","A preferred branch is outside the organization");}
    if(input.doctorIds.length){const count=(await client.query<{count:number}>(`SELECT count(DISTINCT d.id)::int AS count FROM doctors d
      JOIN employee_branches eb ON eb.employee_id=d.employee_id JOIN branches b ON b.id=eb.branch_id
      WHERE d.id=ANY($1::uuid[]) AND b.organization_id=$2`,[[...new Set(input.doctorIds)],input.organizationId])).rows[0]?.count ?? 0;
      if(count!==new Set(input.doctorIds).size)throw new ApiException(HttpStatus.CONFLICT,"WAITLIST_DOCTOR_MISMATCH","A preferred doctor is outside the organization");}
  }
  private insertPreference(client:PoolClient,tenantId:string,organizationId:string,entryId:string,kind:string,value:string|number){
    const columns:{[key:string]:string}={doctor:"doctor_id",specialty:"specialty",branch:"branch_id",weekday:"weekday"};
    return client.query(`INSERT INTO waitlist_preferences(tenant_id,organization_id,waitlist_entry_id,kind,${columns[kind]}) VALUES($1,$2,$3,$4,$5)`,
      [tenantId,organizationId,entryId,kind,value]);
  }
  private parsePublicToken(token:string){const [tenantId,secret,...rest]=token.split(".");if(rest.length || !tenantId || !secret ||
    !/^[0-9a-f-]{36}$/i.test(tenantId) || !/^[0-9a-f-]{36}$/i.test(secret))throw new ApiException(HttpStatus.NOT_FOUND,"WAITLIST_OFFER_NOT_FOUND","Offer not found");
    return {tenantId,hash:createHash("sha256").update(secret).digest("hex")};}
  private async findOffer(client:PoolClient,hash:string,lock:boolean){const result=await client.query<OfferRow>(`SELECT id,organization_id AS "organizationId",
    waitlist_entry_id AS "entryId",source_appointment_id AS "sourceAppointmentId",patient_id AS "patientId",branch_id AS "branchId",
    doctor_id AS "doctorId",room_id AS "roomId",chair_id AS "chairId",starts_at AS "startsAt",ends_at AS "endsAt",expires_at AS "expiresAt",status
    FROM waitlist_offers WHERE token_hash=$1${lock?" FOR UPDATE":""}`,[hash]);return result.rows[0];}
  private assertOfferPending(offer:OfferRow){if(offer.status!=="pending")throw new ApiException(HttpStatus.CONFLICT,"WAITLIST_OFFER_CLOSED","Offer is no longer active");
    if(offer.expiresAt.getTime()<=Date.now())throw new ApiException(HttpStatus.GONE,"WAITLIST_OFFER_EXPIRED","Offer has expired");}
  private async publicView(client:PoolClient,offer:OfferRow){if(offer.status==="pending" && offer.expiresAt.getTime()<=Date.now()){
      await client.query("UPDATE waitlist_offers SET status='expired',responded_at=now() WHERE id=$1",[offer.id]);offer.status="expired";}
    const details=(await client.query<{branchName:string;doctorName:string}>(`SELECT b.name AS "branchName",concat_ws(' ',e.last_name,e.first_name) AS "doctorName"
      FROM branches b JOIN doctors d ON d.id=$2 JOIN employees e ON e.id=d.employee_id WHERE b.id=$1`,[offer.branchId,offer.doctorId])).rows[0]!;
    return {status:offer.status,startsAt:offer.startsAt,endsAt:offer.endsAt,expiresAt:offer.expiresAt,...details};}
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,entityType:string,entityId:string,after:unknown,
    organizationId:string,reason?:string){await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType,entityId,after,
      ...(reason?{reason}:{}),requestId:auth.requestId});await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,aggregateId:entityId,
      eventType,payload:{[`${entityType.replaceAll("_","")}Id`]:entityId,organizationId},requestId:auth.requestId});}
}

function isDatabaseConflict(error:unknown){return typeof error==="object" && error!==null && "code" in error && ["23P01","23505","23503"].includes(String(error.code));}
