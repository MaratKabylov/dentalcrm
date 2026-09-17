import { createHash, randomBytes } from "node:crypto";
import type {
  ConfirmOcrResultInput, ConfirmPublicBookingInput, CreateBookingRuleInput, CreateIntakeFormInput,
  CreateMessageTemplateInput, CreatePortalInvitationInput, CreateReviewDestinationInput, CreateReviewRequestInput,
  IntakeFormVersionInput, IssueIntakeInput, MessageTemplateVersionInput, PublishBookingSlotsInput, PublicBookingRangeInput,
  QueueNotificationInput, RecordOcrResultInput, PortalRescheduleAppointmentInput, ReviewIntakeInput, SubmitIntakeInput, SubmitReviewInput
} from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertOrganizationAccess, organizationScopeSql, scopeValues } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

interface TokenParts { tenantId: string; hash: string }
interface BookingRuleRow {
  id: string; organizationId: string; branchId: string; doctorId: string; serviceId: string; chairId: string | null;
  durationMinutes: number; slotIntervalMinutes: number; minimumNoticeMinutes: number; bookingHorizonDays: number; active: boolean;
}
interface IntakeRow {
  id: string; organizationId: string; patientId: string; status: string; expiresAt: Date; fields: Array<Record<string, unknown>>;
}

@Injectable()
export class ExperienceService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  createMessageTemplate(auth: AuthContext, input: CreateMessageTemplateInput) {
    return this.database.withTenant(auth, async (client) => {
      await assertOrganizationAccess(client, auth, input.organizationId, false);
      const template=(await client.query<{id:string}>(`INSERT INTO message_templates
        (tenant_id,organization_id,code,name,channel,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
        [auth.tenantId,input.organizationId,input.code,input.name,input.channel,auth.userId])).rows[0]!;
      const version=(await client.query(`INSERT INTO message_template_versions
        (tenant_id,organization_id,template_id,version_number,locale,subject,body,created_by)
        VALUES($1,$2,$3,1,$4,$5,$6,$7) RETURNING id,version_number AS "versionNumber",locale,subject,body,created_at AS "createdAt"`,
        [auth.tenantId,input.organizationId,template.id,input.locale,input.subject ?? null,input.body,auth.userId])).rows[0]!;
      const result={id:template.id,organizationId:input.organizationId,code:input.code,name:input.name,channel:input.channel,version};
      await this.record(client,auth,"message_template.created","MessageTemplateCreated","message_template",template.id,result,input.organizationId);
      return result;
    });
  }

  addMessageTemplateVersion(auth:AuthContext,id:string,input:MessageTemplateVersionInput){return this.database.withTenant(auth,async(client)=>{
    const template=(await client.query<{organizationId:string;version:number}>(`SELECT organization_id AS "organizationId",current_version AS version
      FROM message_templates WHERE id=$1 AND active FOR UPDATE`,[id])).rows[0];if(!template)throw notFound("MESSAGE_TEMPLATE_NOT_FOUND","Message template not found");
    await assertOrganizationAccess(client,auth,template.organizationId,false);const versionNumber=template.version+1;const row=(await client.query(
      `INSERT INTO message_template_versions(tenant_id,organization_id,template_id,version_number,locale,subject,body,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,version_number AS "versionNumber",locale,subject,body,created_at AS "createdAt"`,
      [auth.tenantId,template.organizationId,id,versionNumber,input.locale,input.subject ?? null,input.body,auth.userId])).rows[0]!;
    await client.query("UPDATE message_templates SET current_version=$2,updated_at=now(),updated_by=$3 WHERE id=$1",[id,versionNumber,auth.userId]);
    await this.record(client,auth,"message_template.versioned","MessageTemplateVersionCreated","message_template",id,
      {versionId:row.id,versionNumber},template.organizationId);return row;
  });}

  queueNotification(auth: AuthContext, input: QueueNotificationInput) {
    return this.database.withTenant(auth, async (client) => {
      await assertOrganizationAccess(client,auth,input.organizationId,false);
      const previous=(await client.query(`SELECT id,status,scheduled_at AS "scheduledAt" FROM notification_jobs
        WHERE organization_id=$1 AND idempotency_key=$2`,[input.organizationId,input.idempotencyKey])).rows[0];
      if(previous)return previous;
      if(input.patientId){const preference=(await client.query<{allowed:boolean}>(`SELECT allowed FROM communication_preferences
        WHERE organization_id=$1 AND patient_id=$2 AND channel=$3`,[input.organizationId,input.patientId,input.channel])).rows[0];
        if(preference?.allowed===false)throw conflict("COMMUNICATION_OPT_OUT","Patient opted out of this communication channel");}
      const template=(await client.query<{id:string;channel:string;subject:string|null;body:string}>(`SELECT v.id,t.channel,v.subject,v.body
        FROM message_templates t JOIN message_template_versions v ON v.template_id=t.id AND v.version_number=t.current_version
        WHERE t.id=$1 AND t.organization_id=$2 AND t.active`,[input.templateId,input.organizationId])).rows[0];
      if(!template)throw notFound("MESSAGE_TEMPLATE_NOT_FOUND","Message template not found");
      if(template.channel!==input.channel)throw bad("MESSAGE_CHANNEL_MISMATCH","Template channel does not match notification channel");
      const renderedBody=renderTemplate(template.body,input.variables),renderedSubject=template.subject?renderTemplate(template.subject,input.variables):null;
      const row=(await client.query<{id:string}&Record<string,unknown>>(`INSERT INTO notification_jobs
        (tenant_id,organization_id,patient_id,template_version_id,channel,recipient,variables,rendered_subject,rendered_body,
         correlation_id,idempotency_key,scheduled_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)
        RETURNING id,status,scheduled_at AS "scheduledAt",correlation_id AS "correlationId"`,[auth.tenantId,input.organizationId,
        input.patientId ?? null,template.id,input.channel,input.recipient,JSON.stringify(input.variables),renderedSubject,renderedBody,
        input.correlationId,input.idempotencyKey,input.scheduledAt ?? new Date(),auth.userId])).rows[0]!;
      await this.record(client,auth,"notification.queued","NotificationQueued","notification_job",row.id,
        {id:row.id,status:row.status,channel:input.channel,correlationId:input.correlationId},input.organizationId);
      return row;
    });
  }

  listNotifications(auth: AuthContext) {
    const scope=auth.tenantWide?{sql:"TRUE",values:[] as unknown[]}:{sql:organizationScopeSql("j",1,2),values:scopeValues(auth)};
    return this.database.withTenant(auth,async(client)=>(await client.query(`SELECT j.id,j.organization_id AS "organizationId",j.patient_id AS "patientId",
      j.channel,j.recipient,j.status,j.scheduled_at AS "scheduledAt",j.attempts,j.last_error AS "lastError",j.correlation_id AS "correlationId",
      COALESCE(jsonb_agg(jsonb_build_object('provider',d.provider,'status',d.status,'occurredAt',d.occurred_at))
        FILTER(WHERE d.id IS NOT NULL),'[]') AS deliveries
      FROM notification_jobs j LEFT JOIN notification_deliveries d ON d.job_id=j.id WHERE ${scope.sql}
      GROUP BY j.id ORDER BY j.created_at DESC LIMIT 300`,scope.values)).rows);
  }

  createPortalInvitation(auth: AuthContext, input: CreatePortalInvitationInput) {
    return this.database.withTenant(auth,async(client)=>{
      await assertOrganizationAccess(client,auth,input.organizationId,false);await assertPatient(client,input.patientId);
      const issued=issueToken(auth.tenantId),normalized=normalizeContact(input.contactType,input.contact),expiresAt=hoursFromNow(input.expiresInHours);
      const account=(await client.query<{id:string}>(`INSERT INTO portal_accounts
        (tenant_id,organization_id,contact_type,contact,contact_normalized,invitation_token_hash,invitation_expires_at,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,organization_id,contact_type,contact_normalized) DO UPDATE SET
        contact=EXCLUDED.contact,invitation_token_hash=EXCLUDED.invitation_token_hash,invitation_expires_at=EXCLUDED.invitation_expires_at,
        invitation_consumed_at=NULL,status=CASE WHEN portal_accounts.status='suspended' THEN 'suspended' ELSE 'invited' END
        RETURNING id`,[auth.tenantId,input.organizationId,input.contactType,input.contact,normalized,issued.hash,expiresAt,auth.userId])).rows[0]!;
      const link=(await client.query<{id:string}>(`INSERT INTO portal_patient_links
        (tenant_id,organization_id,account_id,patient_id,relationship,access_level,verified_at,verified_by,evidence_reference)
        VALUES($1,$2,$3,$4,$5,$6,now(),$7,$8) ON CONFLICT(tenant_id,organization_id,account_id,patient_id) DO UPDATE SET
        relationship=EXCLUDED.relationship,access_level=EXCLUDED.access_level,verified_at=now(),verified_by=EXCLUDED.verified_by,
        evidence_reference=EXCLUDED.evidence_reference,revoked_at=NULL,revoked_by=NULL RETURNING id`,[auth.tenantId,input.organizationId,
        account.id,input.patientId,input.relationship,input.accessLevel,auth.userId,input.evidenceReference])).rows[0]!;
      if(input.relationship!=="self")await client.query(`INSERT INTO legal_representative_links
        (tenant_id,organization_id,represented_patient_id,portal_account_id,relationship,evidence_reference,verified_at,verified_by)
        VALUES($1,$2,$3,$4,$5,$6,now(),$7) ON CONFLICT(tenant_id,organization_id,portal_account_id,represented_patient_id) DO UPDATE SET
        relationship=EXCLUDED.relationship,evidence_reference=EXCLUDED.evidence_reference,verified_at=now(),verified_by=EXCLUDED.verified_by,
        revoked_at=NULL,revoked_by=NULL`,[auth.tenantId,input.organizationId,input.patientId,account.id,input.relationship,
        input.evidenceReference,auth.userId]);
      await this.record(client,auth,"portal.invitation_created","PortalInvitationCreated","portal_account",account.id,
        {accountId:account.id,patientId:input.patientId,linkId:link.id,relationship:input.relationship,expiresAt},input.organizationId);
      return {accountId:account.id,patientLinkId:link.id,invitationToken:issued.token,expiresAt:expiresAt.toISOString()};
    });
  }

  exchangePortalInvitation(token: string) {
    const parsed=parseToken(token,"PORTAL_INVITATION_INVALID");
    return this.database.withTenant({tenantId:parsed.tenantId,requestId:"portal-session"},async(client)=>{
      const account=(await client.query<{id:string;organizationId:string;status:string;expiresAt:Date}>(`SELECT id,organization_id AS "organizationId",
        status,invitation_expires_at AS "expiresAt" FROM portal_accounts WHERE invitation_token_hash=$1 FOR UPDATE`,[parsed.hash])).rows[0];
      if(!account || account.status==="suspended")throw notFound("PORTAL_INVITATION_INVALID","Invitation is invalid");
      if(!account.expiresAt || account.expiresAt.getTime()<=Date.now())throw new ApiException(HttpStatus.GONE,"PORTAL_INVITATION_EXPIRED","Invitation has expired");
      const session=issueToken(parsed.tenantId),expiresAt=daysFromNow(30);
      await client.query(`UPDATE portal_accounts SET status='active',activated_at=COALESCE(activated_at,now()),invitation_token_hash=NULL,
        invitation_expires_at=NULL,invitation_consumed_at=now() WHERE id=$1`,[account.id]);
      await client.query(`INSERT INTO portal_sessions(tenant_id,organization_id,account_id,token_hash,expires_at)
        VALUES($1,$2,$3,$4,$5)`,[parsed.tenantId,account.organizationId,account.id,session.hash,expiresAt]);
      return {sessionToken:session.token,expiresAt:expiresAt.toISOString()};
    });
  }

  portalMe(token:string){const parsed=parseToken(token,"PORTAL_SESSION_INVALID");return this.database.withTenant({tenantId:parsed.tenantId,requestId:"portal"},
    async(client)=>{const session=await this.requirePortalSession(client,parsed.hash);const links=(await client.query(`SELECT l.patient_id AS "patientId",
      l.relationship,l.access_level AS "accessLevel",p.first_name AS "firstName",p.last_name AS "lastName",p.birth_date AS "birthDate"
      FROM portal_patient_links l JOIN patients p ON p.id=l.patient_id WHERE l.account_id=$1 AND l.revoked_at IS NULL ORDER BY p.last_name,p.first_name`,
      [session.accountId])).rows;return {account:{id:session.accountId,organizationId:session.organizationId,contactType:session.contactType,
      contact:maskContact(session.contactType,session.contact)},patients:links};});}

  portalPatientSummary(token:string,patientId:string){const parsed=parseToken(token,"PORTAL_SESSION_INVALID");return this.database.withTenant(
    {tenantId:parsed.tenantId,requestId:"portal"},async(client)=>{const session=await this.requirePortalSession(client,parsed.hash);
      const link=(await client.query(`SELECT access_level FROM portal_patient_links WHERE account_id=$1 AND patient_id=$2 AND revoked_at IS NULL`,
        [session.accountId,patientId])).rows[0];if(!link)throw new ApiException(HttpStatus.FORBIDDEN,"PORTAL_PATIENT_ACCESS_DENIED","Patient is not linked to this portal account");
      const patient=await client.query(`SELECT id,first_name AS "firstName",last_name AS "lastName",middle_name AS "middleName",birth_date AS "birthDate",
          sex,phone,email FROM patients WHERE id=$1 AND archived_at IS NULL`,[patientId]),
        appointments=await client.query(`SELECT a.id,a.starts_at AS "startsAt",a.ends_at AS "endsAt",a.status,b.name AS "branchName",
          concat_ws(' ',e.last_name,e.first_name) AS "doctorName" FROM appointments a JOIN branches b ON b.id=a.branch_id
          JOIN doctors d ON d.id=a.doctor_id JOIN employees e ON e.id=d.employee_id WHERE a.patient_id=$1 AND b.organization_id=$2
          ORDER BY a.starts_at DESC LIMIT 100`,[patientId,session.organizationId]),
        plans=await client.query(`SELECT p.id,p.title,p.status,p.currency,p.created_at AS "createdAt",
          COALESCE(sum(i.final_price_minor),0)::text AS "totalAmountMinor" FROM treatment_plans p LEFT JOIN treatment_plan_items i ON i.treatment_plan_id=p.id
          WHERE p.patient_id=$1 AND p.status<>'draft' GROUP BY p.id ORDER BY p.created_at DESC`,[patientId]),
        documents=await client.query(`SELECT d.id,d.kind,d.title,d.status,d.updated_at AS "updatedAt" FROM documents d
          WHERE d.patient_id=$1 AND d.status='signed' ORDER BY d.updated_at DESC`,[patientId]),
        finance=await client.query(`SELECT COALESCE((SELECT sum(c.total_amount_minor) FROM charges c JOIN branches b ON b.id=c.branch_id
            WHERE c.patient_id=$1 AND b.organization_id=$2),0)::text AS charged,
          COALESCE((SELECT sum(pa.amount_minor) FROM payment_allocations pa JOIN charges c ON c.id=pa.charge_id JOIN branches b ON b.id=c.branch_id
            WHERE c.patient_id=$1 AND b.organization_id=$2),0)::text AS paid`,[patientId,session.organizationId]);
      if(!patient.rows[0])throw notFound("PATIENT_NOT_FOUND","Patient not found");const f=finance.rows[0] as {charged:string;paid:string};
      return {patient:patient.rows[0],accessLevel:link.access_level,appointments:appointments.rows,
        treatmentPlans:plans.rows.map((row)=>({...row,totalAmountMinor:Number(row.totalAmountMinor)})),documents:documents.rows,
        finance:{chargedMinor:Number(f.charged),paidMinor:Number(f.paid),debtMinor:Number(f.charged)-Number(f.paid)}};
    });}

  cancelPortalAppointment(token:string,appointmentId:string,reason:string){const parsed=parseToken(token,"PORTAL_SESSION_INVALID");return this.database.withTenant(
    {tenantId:parsed.tenantId,requestId:"portal"},async(client)=>{const session=await this.requirePortalSession(client,parsed.hash);
      const appointment=await this.requirePortalAppointment(client,session.accountId,session.organizationId,appointmentId,true);
      if(!["created","awaiting_confirmation","confirmed"].includes(appointment.status))throw conflict("PORTAL_APPOINTMENT_NOT_CANCELLABLE",
        "Appointment cannot be cancelled in the current state");await client.query(`UPDATE appointments SET status='cancelled',reason=$2,
        updated_at=now(),version=version+1 WHERE id=$1`,[appointmentId,reason]);await client.query(`INSERT INTO appointment_status_events
        (tenant_id,appointment_id,from_status,to_status,reason) VALUES($1,$2,$3,'cancelled',$4)`,[parsed.tenantId,appointmentId,appointment.status,reason]);
      await this.outbox.append(client,{tenantId:parsed.tenantId,aggregateType:"appointment",aggregateId:appointmentId,eventType:"AppointmentCancelled",
        payload:{appointmentId,organizationId:session.organizationId,patientId:appointment.patientId,branchId:appointment.branchId},requestId:"portal"});
      return {appointmentId,status:"cancelled"};});}

  async reschedulePortalAppointment(token:string,appointmentId:string,input:PortalRescheduleAppointmentInput){const parsed=parseToken(token,"PORTAL_SESSION_INVALID");
    try{return await this.database.withTenant({tenantId:parsed.tenantId,requestId:"portal"},async(client)=>{const session=await this.requirePortalSession(client,parsed.hash);
      const current=await this.requirePortalAppointment(client,session.accountId,session.organizationId,appointmentId,true);
      if(!["created","awaiting_confirmation","confirmed"].includes(current.status))throw conflict("PORTAL_APPOINTMENT_NOT_RESCHEDULABLE",
        "Appointment cannot be rescheduled in the current state");const slot=(await client.query<BookingRuleRow&{slotId:string;startsAt:Date;endsAt:Date;status:string}>(
        `SELECT s.id AS "slotId",s.organization_id AS "organizationId",s.branch_id AS "branchId",s.doctor_id AS "doctorId",
        s.service_id AS "serviceId",s.chair_id AS "chairId",s.starts_at AS "startsAt",s.ends_at AS "endsAt",s.status,r.id,r.active,
        r.minimum_notice_minutes AS "minimumNoticeMinutes",r.booking_horizon_days AS "bookingHorizonDays",r.slot_interval_minutes AS "slotIntervalMinutes",
        v.duration_minutes AS "durationMinutes" FROM public_booking_slots s JOIN booking_rules r ON r.id=s.booking_rule_id
        JOIN services v ON v.id=s.service_id WHERE s.id=$1 AND s.organization_id=$2 FOR UPDATE`,[input.slotId,session.organizationId])).rows[0];
      if(!slot || slot.status!=="published" || !slot.active || slot.startsAt.getTime()<=Date.now()+slot.minimumNoticeMinutes*60_000)
        throw conflict("BOOKING_SLOT_UNAVAILABLE","Booking slot is no longer available");
      if(await this.slotHasConflict(client,slot,slot.startsAt,slot.endsAt,appointmentId))throw conflict("BOOKING_SLOT_UNAVAILABLE","Booking resource is no longer available");
      await client.query(`UPDATE appointments SET status='rescheduled',reason=$2,updated_at=now(),version=version+1 WHERE id=$1`,[appointmentId,input.reason]);
      const replacement=(await client.query<{id:string}>(`INSERT INTO appointments(tenant_id,patient_id,doctor_id,branch_id,chair_id,starts_at,ends_at,
        status,source,reason,notes) VALUES($1,$2,$3,$4,$5,$6,$7,'confirmed','web',$8,$9) RETURNING id`,[parsed.tenantId,current.patientId,
        slot.doctorId,slot.branchId,slot.chairId,slot.startsAt,slot.endsAt,input.reason,current.notes])).rows[0]!;
      await client.query("INSERT INTO appointment_services(tenant_id,appointment_id,service_id) VALUES($1,$2,$3)",[parsed.tenantId,replacement.id,slot.serviceId]);
      await client.query(`INSERT INTO appointment_status_events(tenant_id,appointment_id,from_status,to_status,reason) VALUES
        ($1,$2,$3,'rescheduled',$4),($1,$5,NULL,'confirmed',$4)`,[parsed.tenantId,appointmentId,current.status,input.reason,replacement.id]);
      await client.query("UPDATE public_booking_slots SET status='booked',appointment_id=$2,booked_at=now() WHERE id=$1",[slot.slotId,replacement.id]);
      await this.outbox.append(client,{tenantId:parsed.tenantId,aggregateType:"appointment",aggregateId:appointmentId,eventType:"AppointmentRescheduled",
        payload:{appointmentId,replacementId:replacement.id,organizationId:session.organizationId,patientId:current.patientId},requestId:"portal"});
      return {previousId:appointmentId,appointmentId:replacement.id,status:"confirmed"};});}catch(error){if(isDatabaseConflict(error))
      throw conflict("BOOKING_SLOT_UNAVAILABLE","Booking resource is no longer available");throw error;}}

  createBookingRule(auth:AuthContext,input:CreateBookingRuleInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);await this.assertBookingResources(client,input);
    const row=(await client.query(`INSERT INTO booking_rules(tenant_id,organization_id,branch_id,doctor_id,service_id,chair_id,
      slot_interval_minutes,minimum_notice_minutes,booking_horizon_days,active,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id,organization_id AS "organizationId",branch_id AS "branchId",
      doctor_id AS "doctorId",service_id AS "serviceId",chair_id AS "chairId",slot_interval_minutes AS "slotIntervalMinutes",
      minimum_notice_minutes AS "minimumNoticeMinutes",booking_horizon_days AS "bookingHorizonDays",active`,[auth.tenantId,input.organizationId,
      input.branchId,input.doctorId,input.serviceId,input.chairId ?? null,input.slotIntervalMinutes,input.minimumNoticeMinutes,
      input.bookingHorizonDays,input.active,auth.userId])).rows[0] as {id:string}&Record<string,unknown>;
    await this.record(client,auth,"booking_rule.created","BookingRuleCreated","booking_rule",row.id,row,input.organizationId);return row;
  });}

  publishBookingSlots(auth:AuthContext,id:string,input:PublishBookingSlotsInput){return this.database.withTenant(auth,async(client)=>{
    const rule=await this.findBookingRule(client,id);await assertOrganizationAccess(client,auth,rule.organizationId,false);
    if(!rule.active)throw conflict("BOOKING_RULE_INACTIVE","Booking rule is inactive");const published:Array<Record<string,unknown>>=[],rejected:Array<Record<string,unknown>>=[];
    for(const value of [...new Set(input.startsAt)]){const startsAt=new Date(value),endsAt=new Date(startsAt.getTime()+rule.durationMinutes*60_000);
      const reason=await this.slotRejection(client,rule,startsAt,endsAt);if(reason){rejected.push({startsAt:value,reason});continue;}
      const row=(await client.query(`INSERT INTO public_booking_slots(tenant_id,organization_id,booking_rule_id,branch_id,doctor_id,service_id,
        chair_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,starts_at AS "startsAt",ends_at AS "endsAt"`,
        [auth.tenantId,rule.organizationId,rule.id,rule.branchId,rule.doctorId,rule.serviceId,rule.chairId,startsAt,endsAt])).rows[0]!;published.push(row);}
    await this.record(client,auth,"booking_slots.published","BookingSlotsPublished","booking_rule",id,{published:published.length,rejected},rule.organizationId);
    return {published,rejected};
  });}

  listPublicBookingSlots(tenantId:string,organizationId:string,input:PublicBookingRangeInput){return this.database.withTenant(
    {tenantId,requestId:"public-booking"},async(client)=>(await client.query(`SELECT s.id,s.branch_id AS "branchId",b.name AS "branchName",
      s.doctor_id AS "doctorId",concat_ws(' ',e.last_name,e.first_name) AS "doctorName",d.specialty,s.service_id AS "serviceId",
      v.name AS "serviceName",s.starts_at AS "startsAt",s.ends_at AS "endsAt" FROM public_booking_slots s
      JOIN booking_rules r ON r.id=s.booking_rule_id JOIN branches b ON b.id=s.branch_id JOIN doctors d ON d.id=s.doctor_id
      JOIN employees e ON e.id=d.employee_id JOIN services v ON v.id=s.service_id WHERE s.organization_id=$1 AND s.status='published'
      AND r.active AND s.starts_at>now()+(r.minimum_notice_minutes*interval '1 minute') AND s.starts_at>=$2 AND s.starts_at<$3
      AND ($4::uuid IS NULL OR s.service_id=$4) AND ($5::uuid IS NULL OR s.doctor_id=$5) AND ($6::uuid IS NULL OR s.branch_id=$6)
      ORDER BY s.starts_at LIMIT 500`,[organizationId,input.from,input.to,input.serviceId ?? null,input.doctorId ?? null,input.branchId ?? null])).rows);
  }

  async confirmPublicBooking(tenantId:string,organizationId:string,idempotencyKey:string,input:ConfirmPublicBookingInput){try{return await this.database.withTenant(
    {tenantId,requestId:`public-booking:${idempotencyKey}`},async(client)=>{const prior=(await client.query(`SELECT id AS "bookingRequestId",appointment_id AS "appointmentId",status
      FROM booking_requests WHERE organization_id=$1 AND idempotency_key=$2`,[organizationId,idempotencyKey])).rows[0];if(prior)return prior;
      const slot=(await client.query<BookingRuleRow&{slotId:string;startsAt:Date;endsAt:Date;status:string}>(`SELECT s.id AS "slotId",s.organization_id AS "organizationId",
        s.branch_id AS "branchId",s.doctor_id AS "doctorId",s.service_id AS "serviceId",s.chair_id AS "chairId",s.starts_at AS "startsAt",
        s.ends_at AS "endsAt",s.status,r.id,r.minimum_notice_minutes AS "minimumNoticeMinutes",r.booking_horizon_days AS "bookingHorizonDays",
        r.slot_interval_minutes AS "slotIntervalMinutes",r.active,v.duration_minutes AS "durationMinutes" FROM public_booking_slots s
        JOIN booking_rules r ON r.id=s.booking_rule_id JOIN services v ON v.id=s.service_id WHERE s.id=$1 AND s.organization_id=$2 FOR UPDATE`,
        [input.slotId,organizationId])).rows[0];if(!slot)throw notFound("BOOKING_SLOT_NOT_FOUND","Booking slot not found");
      if(slot.status!=="published" || !slot.active)throw conflict("BOOKING_SLOT_UNAVAILABLE","Booking slot is no longer available");
      if(slot.startsAt.getTime()<=Date.now()+slot.minimumNoticeMinutes*60_000)throw conflict("BOOKING_SLOT_UNAVAILABLE","Booking deadline has passed");
      if(await this.slotHasConflict(client,slot,slot.startsAt,slot.endsAt))throw conflict("BOOKING_SLOT_UNAVAILABLE","Booking resource is no longer available");
      const phone=normalizePhone(input.phone);let patient=(await client.query<{id:string}>(`SELECT id FROM patients WHERE phone_normalized=$1
        AND archived_at IS NULL ORDER BY created_at LIMIT 1`,[phone])).rows[0];if(!patient)patient=(await client.query<{id:string}>(`INSERT INTO patients
        (tenant_id,first_name,last_name,phone,phone_normalized,email) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [tenantId,input.firstName,input.lastName,input.phone,phone,input.email ?? null])).rows[0]!;
      const appointment=(await client.query<{id:string}>(`INSERT INTO appointments(tenant_id,patient_id,doctor_id,branch_id,chair_id,starts_at,ends_at,
        status,source,notes) VALUES($1,$2,$3,$4,$5,$6,$7,'confirmed','web',$8) RETURNING id`,[tenantId,patient.id,slot.doctorId,
        slot.branchId,slot.chairId,slot.startsAt,slot.endsAt,input.notes ?? null])).rows[0]!;
      await client.query(`INSERT INTO appointment_services(tenant_id,appointment_id,service_id) VALUES($1,$2,$3)`,[tenantId,appointment.id,slot.serviceId]);
      await client.query(`INSERT INTO appointment_status_events(tenant_id,appointment_id,to_status) VALUES($1,$2,'confirmed')`,[tenantId,appointment.id]);
      const request=(await client.query<{id:string}>(`INSERT INTO booking_requests(tenant_id,organization_id,slot_id,patient_id,appointment_id,
        idempotency_key,contact_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id`,[tenantId,organizationId,slot.slotId,
        patient.id,appointment.id,idempotencyKey,JSON.stringify({firstName:input.firstName,lastName:input.lastName,phone:input.phone,email:input.email})])).rows[0]!;
      await client.query(`UPDATE public_booking_slots SET status='booked',appointment_id=$2,booked_at=now() WHERE id=$1`,[slot.slotId,appointment.id]);
      await this.outbox.append(client,{tenantId,aggregateType:"appointment",aggregateId:appointment.id,eventType:"PublicBookingConfirmed",
        payload:{appointmentId:appointment.id,bookingRequestId:request.id,organizationId},requestId:`public-booking:${idempotencyKey}`});
      return {bookingRequestId:request.id,appointmentId:appointment.id,status:"confirmed"};
    });}catch(error){if(isDatabaseConflict(error))throw conflict("BOOKING_SLOT_UNAVAILABLE","Booking resource is no longer available");throw error;}}

  createIntakeForm(auth:AuthContext,input:CreateIntakeFormInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);const form=(await client.query<{id:string}>(`INSERT INTO intake_forms
      (tenant_id,organization_id,code,name,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) RETURNING id`,
      [auth.tenantId,input.organizationId,input.code,input.name,auth.userId])).rows[0]!;
    const version=(await client.query(`INSERT INTO intake_form_versions(tenant_id,organization_id,form_id,version_number,fields,created_by)
      VALUES($1,$2,$3,1,$4::jsonb,$5) RETURNING id,version_number AS "versionNumber",fields`,[auth.tenantId,input.organizationId,
      form.id,JSON.stringify(input.fields),auth.userId])).rows[0]!;await this.record(client,auth,"intake_form.created","IntakeFormCreated",
      "intake_form",form.id,{...form,version},input.organizationId);return {id:form.id,organizationId:input.organizationId,code:input.code,name:input.name,version};
  });}

  addIntakeFormVersion(auth:AuthContext,id:string,input:IntakeFormVersionInput){return this.database.withTenant(auth,async(client)=>{
    const form=(await client.query<{organizationId:string;version:number}>(`SELECT organization_id AS "organizationId",current_version AS version
      FROM intake_forms WHERE id=$1 AND active FOR UPDATE`,[id])).rows[0];if(!form)throw notFound("INTAKE_FORM_NOT_FOUND","Intake form not found");
    await assertOrganizationAccess(client,auth,form.organizationId,false);const versionNumber=form.version+1;const row=(await client.query(
      `INSERT INTO intake_form_versions(tenant_id,organization_id,form_id,version_number,fields,created_by)
       VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING id,version_number AS "versionNumber",fields,created_at AS "createdAt"`,
      [auth.tenantId,form.organizationId,id,versionNumber,JSON.stringify(input.fields),auth.userId])).rows[0]!;
    await client.query("UPDATE intake_forms SET current_version=$2,updated_at=now(),updated_by=$3 WHERE id=$1",[id,versionNumber,auth.userId]);
    await this.record(client,auth,"intake_form.versioned","IntakeFormVersionCreated","intake_form",id,
      {versionId:row.id,versionNumber},form.organizationId);return row;
  });}

  issueIntake(auth:AuthContext,formId:string,input:IssueIntakeInput){return this.database.withTenant(auth,async(client)=>{
    const form=(await client.query<{organizationId:string;versionId:string}>(`SELECT f.organization_id AS "organizationId",v.id AS "versionId"
      FROM intake_forms f JOIN intake_form_versions v ON v.form_id=f.id AND v.version_number=f.current_version WHERE f.id=$1 AND f.active`,[formId])).rows[0];
    if(!form)throw notFound("INTAKE_FORM_NOT_FOUND","Intake form not found");await assertOrganizationAccess(client,auth,form.organizationId,false);
    await assertPatient(client,input.patientId);const issued=issueToken(auth.tenantId),expiresAt=hoursFromNow(input.expiresInHours);
    const submission=(await client.query<{id:string}>(`INSERT INTO intake_submissions(tenant_id,organization_id,form_version_id,patient_id,
      access_token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[auth.tenantId,form.organizationId,
      form.versionId,input.patientId,issued.hash,expiresAt,auth.userId])).rows[0]!;await this.record(client,auth,"intake.issued","IntakeIssued",
      "intake_submission",submission.id,{patientId:input.patientId,expiresAt},form.organizationId);return {submissionId:submission.id,
      accessToken:issued.token,expiresAt:expiresAt.toISOString()};
  });}

  getPublicIntake(token:string){const parsed=parseToken(token,"INTAKE_LINK_INVALID");return this.database.withTenant({tenantId:parsed.tenantId,requestId:"public-intake"},
    async(client)=>{const row=await this.findIntakeByToken(client,parsed.hash);return {submissionId:row.id,status:row.status,expiresAt:row.expiresAt,
      fields:row.fields};});}

  submitPublicIntake(token:string,input:SubmitIntakeInput){const parsed=parseToken(token,"INTAKE_LINK_INVALID");return this.database.withTenant(
    {tenantId:parsed.tenantId,requestId:"public-intake"},async(client)=>{const row=await this.findIntakeByToken(client,parsed.hash,true);
      if(row.status!=="issued")throw conflict("INTAKE_ALREADY_SUBMITTED","Intake was already submitted");validateAnswers(row.fields,input);
      await client.query(`UPDATE intake_submissions SET status='submitted',answers=$2::jsonb,uploads=$3::jsonb,submitted_at=now() WHERE id=$1`,
        [row.id,JSON.stringify(input.answers),JSON.stringify(input.uploads)]);if(input.uploads.length)await client.query(`INSERT INTO ocr_jobs
        (tenant_id,organization_id,submission_id) VALUES($1,$2,$3)`,[parsed.tenantId,row.organizationId,row.id]);
      await this.outbox.append(client,{tenantId:parsed.tenantId,aggregateType:"intake_submission",aggregateId:row.id,eventType:"IntakeSubmitted",
        payload:{submissionId:row.id,organizationId:row.organizationId,hasUploads:input.uploads.length>0},requestId:"public-intake"});
      return {submissionId:row.id,status:"submitted",ocrPending:input.uploads.length>0};
    });}

  recordOcrResult(auth:AuthContext,submissionId:string,input:RecordOcrResultInput){return this.database.withTenant(auth,async(client)=>{
    const submission=(await client.query<{organizationId:string;status:string}>(`SELECT organization_id AS "organizationId",status
      FROM intake_submissions WHERE id=$1 FOR UPDATE`,[submissionId])).rows[0];if(!submission)throw notFound("INTAKE_SUBMISSION_NOT_FOUND","Intake submission not found");
    await assertOrganizationAccess(client,auth,submission.organizationId,false);if(submission.status!=="submitted")throw conflict("INTAKE_NOT_READY_FOR_OCR","Intake is not ready for OCR");
    const job=(await client.query<{id:string}>(`SELECT id FROM ocr_jobs WHERE submission_id=$1 FOR UPDATE`,[submissionId])).rows[0];
    if(!job)throw conflict("OCR_NOT_REQUESTED","Submission has no uploaded document requiring OCR");
    const result=(await client.query<{id:string}>(`INSERT INTO ocr_results(tenant_id,organization_id,ocr_job_id,provider,extracted_data,confidence,raw_reference)
      VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id`,[auth.tenantId,submission.organizationId,job.id,input.provider,
      JSON.stringify(input.extractedData),input.confidence ?? null,input.rawReference ?? null])).rows[0]!;
    await client.query("UPDATE ocr_jobs SET status='succeeded',completed_at=now() WHERE id=$1",[job.id]);
    await client.query("UPDATE intake_submissions SET status='ocr_ready' WHERE id=$1",[submissionId]);
    await this.record(client,auth,"ocr.result_recorded","OcrResultRecorded","intake_submission",submissionId,{ocrResultId:result.id},submission.organizationId);
    return {submissionId,ocrResultId:result.id,status:"ocr_ready"};
  });}

  getPublicOcr(token:string){const parsed=parseToken(token,"INTAKE_LINK_INVALID");return this.database.withTenant({tenantId:parsed.tenantId,requestId:"public-intake"},
    async(client)=>{const row=await this.findIntakeByToken(client,parsed.hash);if(!["ocr_ready","patient_confirmed","reviewed"].includes(row.status))
      throw conflict("OCR_NOT_READY","OCR result is not ready");const result=(await client.query(`SELECT r.extracted_data AS "extractedData",r.confidence
        FROM ocr_results r JOIN ocr_jobs j ON j.id=r.ocr_job_id WHERE j.submission_id=$1`,[row.id])).rows[0];
      if(!result)throw conflict("OCR_NOT_READY","OCR result is not ready");return {submissionId:row.id,status:row.status,...result};});}

  confirmPublicOcr(token:string,input:ConfirmOcrResultInput){const parsed=parseToken(token,"INTAKE_LINK_INVALID");return this.database.withTenant(
    {tenantId:parsed.tenantId,requestId:"public-intake"},async(client)=>{const row=await this.findIntakeByToken(client,parsed.hash,true);
      if(row.status!=="ocr_ready")throw conflict("OCR_CONFIRMATION_UNAVAILABLE","OCR result cannot be confirmed in the current state");
      await client.query(`UPDATE intake_submissions SET status='patient_confirmed',confirmed_data=$2::jsonb,confirmed_at=now() WHERE id=$1`,
        [row.id,JSON.stringify(input.acceptedData)]);await this.outbox.append(client,{tenantId:parsed.tenantId,aggregateType:"intake_submission",
        aggregateId:row.id,eventType:"OcrResultConfirmed",payload:{submissionId:row.id,organizationId:row.organizationId},requestId:"public-intake"});
      return {submissionId:row.id,status:"patient_confirmed"};
    });}

  reviewIntake(auth:AuthContext,id:string,input:ReviewIntakeInput){return this.database.withTenant(auth,async(client)=>{
    const row=(await client.query<{organizationId:string;patientId:string;status:string;confirmedData:Record<string,unknown>}>(`SELECT organization_id AS "organizationId",
      patient_id AS "patientId",status,confirmed_data AS "confirmedData" FROM intake_submissions WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!row)throw notFound("INTAKE_SUBMISSION_NOT_FOUND","Intake submission not found");await assertOrganizationAccess(client,auth,row.organizationId,false);
    if(row.status!=="patient_confirmed")throw conflict("OCR_NOT_PATIENT_CONFIRMED","Patient must confirm OCR data before staff review");
    if(input.applyToPatient)await applyConfirmedPatientData(client,row.patientId,row.confirmedData,auth.userId);
    await client.query(`UPDATE intake_submissions SET status='reviewed',reviewed_at=now(),reviewed_by=$2,review_note=$3 WHERE id=$1`,
      [id,auth.userId,input.note ?? null]);await this.record(client,auth,"intake.reviewed","IntakeReviewed","intake_submission",id,
      {status:"reviewed",appliedToPatient:input.applyToPatient},row.organizationId,input.note);return {submissionId:id,status:"reviewed",appliedToPatient:input.applyToPatient};
  });}

  createReviewDestination(auth:AuthContext,input:CreateReviewDestinationInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);const row=(await client.query<{id:string}&Record<string,unknown>>(`INSERT INTO review_destinations
      (tenant_id,organization_id,name,url,active,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,organization_id AS "organizationId",name,url,active`,
      [auth.tenantId,input.organizationId,input.name,input.url,input.active,auth.userId])).rows[0]!;await this.record(client,auth,
      "review_destination.created","ReviewDestinationCreated","review_destination",row.id,row,input.organizationId);return row;
  });}

  createReviewRequest(auth:AuthContext,input:CreateReviewRequestInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);const appointment=(await client.query<{patientId:string;organizationId:string;status:string}>(
      `SELECT a.patient_id AS "patientId",b.organization_id AS "organizationId",a.status FROM appointments a JOIN branches b ON b.id=a.branch_id
      WHERE a.id=$1`,[input.appointmentId])).rows[0];if(!appointment || appointment.organizationId!==input.organizationId)
      throw notFound("APPOINTMENT_NOT_FOUND","Appointment not found");if(appointment.status!=="completed")
      throw conflict("REVIEW_APPOINTMENT_NOT_COMPLETED","A review can be requested only after a completed appointment");
    if(input.destinationId && !(await client.query("SELECT 1 FROM review_destinations WHERE id=$1 AND organization_id=$2 AND active",
      [input.destinationId,input.organizationId])).rows[0])throw bad("REVIEW_DESTINATION_INVALID","Review destination is invalid");
    const issued=issueToken(auth.tenantId),expiresAt=daysFromNow(input.expiresInDays);const row=(await client.query<{id:string}>(`INSERT INTO review_requests
      (tenant_id,organization_id,appointment_id,patient_id,destination_id,token_hash,expires_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[auth.tenantId,input.organizationId,input.appointmentId,appointment.patientId,
      input.destinationId ?? null,issued.hash,expiresAt,auth.userId])).rows[0]!;await this.record(client,auth,"review.requested","ReviewRequested",
      "review_request",row.id,{appointmentId:input.appointmentId,expiresAt},input.organizationId);return {reviewRequestId:row.id,
      accessToken:issued.token,expiresAt:expiresAt.toISOString()};
  });}

  getPublicReview(token:string){const parsed=parseToken(token,"REVIEW_LINK_INVALID");return this.database.withTenant({tenantId:parsed.tenantId,requestId:"public-review"},
    async(client)=>{const row=await this.findReview(client,parsed.hash);return {reviewRequestId:row.id,status:row.status,expiresAt:row.expiresAt,
      clinicName:row.clinicName,destinationUrl:row.destinationUrl};});}

  submitPublicReview(token:string,input:SubmitReviewInput){const parsed=parseToken(token,"REVIEW_LINK_INVALID");return this.database.withTenant(
    {tenantId:parsed.tenantId,requestId:"public-review"},async(client)=>{const row=await this.findReview(client,parsed.hash,true);
      if(row.status!=="pending")throw conflict("REVIEW_ALREADY_SUBMITTED","Review was already submitted");let taskId:string|null=null;
      if(input.rating<=3){taskId=(await client.query<{id:string}>(`INSERT INTO tasks(tenant_id,organization_id,entity_type,entity_id,title,description,
        priority,source,source_reference_id) VALUES($1,$2,'review_request',$3,'Patient feedback needs follow-up',$4,'high','system',$3) RETURNING id`,
        [parsed.tenantId,row.organizationId,row.id,input.comment ?? `Patient rating: ${input.rating}/5`])).rows[0]!.id;
        await client.query(`INSERT INTO task_status_history(tenant_id,organization_id,task_id,to_status) VALUES($1,$2,$3,'open')`,
          [parsed.tenantId,row.organizationId,taskId]);}
      await client.query(`INSERT INTO review_feedback(tenant_id,organization_id,review_request_id,rating,comment,public_review_suggested,
        service_recovery_task_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[parsed.tenantId,row.organizationId,row.id,input.rating,input.comment ?? null,
        input.rating>=4,taskId]);await client.query("UPDATE review_requests SET status='submitted',submitted_at=now() WHERE id=$1",[row.id]);
      await this.outbox.append(client,{tenantId:parsed.tenantId,aggregateType:"review_request",aggregateId:row.id,eventType:"ReviewSubmitted",
        payload:{reviewRequestId:row.id,organizationId:row.organizationId,rating:input.rating,serviceRecoveryTaskId:taskId},requestId:"public-review"});
      return {reviewRequestId:row.id,status:"submitted",destinationUrl:row.destinationUrl,serviceRecoveryCreated:Boolean(taskId)};
    });}

  listReviewFeedback(auth:AuthContext){const scope=auth.tenantWide?{sql:"TRUE",values:[] as unknown[]}:
    {sql:organizationScopeSql("r",1,2),values:scopeValues(auth)};return this.database.withTenant(auth,async(client)=>(await client.query(
      `SELECT f.id,r.organization_id AS "organizationId",r.appointment_id AS "appointmentId",r.patient_id AS "patientId",f.rating,f.comment,
       f.public_review_suggested AS "publicReviewSuggested",f.service_recovery_task_id AS "serviceRecoveryTaskId",f.created_at AS "createdAt"
       FROM review_feedback f JOIN review_requests r ON r.id=f.review_request_id WHERE ${scope.sql} ORDER BY f.created_at DESC LIMIT 300`,scope.values)).rows);}

  private async findBookingRule(client:PoolClient,id:string){const row=(await client.query<BookingRuleRow>(`SELECT r.id,r.organization_id AS "organizationId",
    r.branch_id AS "branchId",r.doctor_id AS "doctorId",r.service_id AS "serviceId",r.chair_id AS "chairId",
    r.slot_interval_minutes AS "slotIntervalMinutes",r.minimum_notice_minutes AS "minimumNoticeMinutes",
    r.booking_horizon_days AS "bookingHorizonDays",r.active,s.duration_minutes AS "durationMinutes"
    FROM booking_rules r JOIN services s ON s.id=r.service_id WHERE r.id=$1`,[id])).rows[0];if(!row)throw notFound("BOOKING_RULE_NOT_FOUND","Booking rule not found");return row;}
  private async assertBookingResources(client:PoolClient,input:CreateBookingRuleInput){const row=(await client.query<{doctor:boolean;service:boolean;chair:boolean}>(
    `SELECT EXISTS(SELECT 1 FROM employee_branches eb JOIN doctors d ON d.employee_id=eb.employee_id WHERE d.id=$2 AND eb.branch_id=$1) doctor,
      EXISTS(SELECT 1 FROM services WHERE id=$3 AND organization_id=$4 AND active) service,
      ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM chairs WHERE id=$5 AND branch_id=$1 AND archived_at IS NULL)) chair`,
    [input.branchId,input.doctorId,input.serviceId,input.organizationId,input.chairId ?? null])).rows[0]!;
    if(!row.doctor || !row.service || !row.chair)throw bad("BOOKING_RESOURCE_MISMATCH","Doctor, service, or chair does not belong to the booking scope");}
  private async slotRejection(client:PoolClient,rule:BookingRuleRow,start:Date,end:Date){const now=Date.now();
    if(start.getTime()<=now+rule.minimumNoticeMinutes*60_000)return "minimum_notice";
    if(start.getTime()>now+rule.bookingHorizonDays*86_400_000)return "booking_horizon";
    if(Math.floor(start.getTime()/60_000)%rule.slotIntervalMinutes!==0)return "slot_alignment";
    const shift=(await client.query(`SELECT s.id FROM schedule_shifts s WHERE s.branch_id=$1 AND s.doctor_id=$2 AND s.starts_at<=$3 AND s.ends_at>=$4
      AND NOT EXISTS(SELECT 1 FROM schedule_breaks x WHERE x.shift_id=s.id AND x.starts_at<$4 AND x.ends_at>$3) LIMIT 1`,
      [rule.branchId,rule.doctorId,start,end])).rows[0];if(!shift)return "outside_schedule";
    if((await client.query(`SELECT 1 FROM schedule_exceptions WHERE branch_id=$1 AND doctor_id=$2 AND kind='unavailable' AND starts_at<$4 AND ends_at>$3 LIMIT 1`,
      [rule.branchId,rule.doctorId,start,end])).rows[0])return "blocked_interval";
    if(await this.slotHasConflict(client,rule,start,end))return "resource_conflict";
    if((await client.query(`SELECT 1 FROM public_booking_slots WHERE status='published' AND doctor_id=$1
      AND tstzrange(starts_at,ends_at,'[)') && tstzrange($2,$3,'[)') LIMIT 1`,[rule.doctorId,start,end])).rows[0])return "published_slot_conflict";
    return null;}
  private async slotHasConflict(client:PoolClient,rule:Pick<BookingRuleRow,"branchId"|"doctorId"|"chairId">,start:Date,end:Date,excludeAppointmentId?:string){return Boolean((await client.query(
    `SELECT 1 WHERE EXISTS(SELECT 1 FROM appointments WHERE doctor_id=$1 AND status NOT IN ('cancelled','no_show','rescheduled')
       AND starts_at<$3 AND ends_at>$2 AND ($6::uuid IS NULL OR id<>$6)) OR ($4::uuid IS NOT NULL AND EXISTS(SELECT 1 FROM appointments WHERE chair_id=$4
       AND status NOT IN ('cancelled','no_show','rescheduled') AND starts_at<$3 AND ends_at>$2 AND ($6::uuid IS NULL OR id<>$6)))
       OR EXISTS(SELECT 1 FROM resource_reservations WHERE branch_id=$5 AND starts_at<$3 AND ends_at>$2
       AND ($4::uuid IS NOT NULL AND chair_id=$4))`,[rule.doctorId,start,end,rule.chairId,rule.branchId,excludeAppointmentId ?? null])).rows[0]);}
  private async requirePortalSession(client:PoolClient,hash:string){const row=(await client.query<{accountId:string;organizationId:string;contactType:string;contact:string}>(
    `SELECT s.account_id AS "accountId",s.organization_id AS "organizationId",a.contact_type AS "contactType",a.contact
     FROM portal_sessions s JOIN portal_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL
     AND s.expires_at>now() AND a.status='active'`,[hash])).rows[0];if(!row)throw new ApiException(HttpStatus.UNAUTHORIZED,"PORTAL_SESSION_INVALID","Portal session is invalid or expired");
    await client.query("UPDATE portal_sessions SET last_used_at=now() WHERE token_hash=$1",[hash]);return row;}
  private async requirePortalAppointment(client:PoolClient,accountId:string,organizationId:string,id:string,lock=false){const row=(await client.query<{
    id:string;patientId:string;branchId:string;status:string;notes:string|null}>(`SELECT a.id,a.patient_id AS "patientId",a.branch_id AS "branchId",a.status,a.notes
    FROM appointments a JOIN branches b ON b.id=a.branch_id JOIN portal_patient_links l ON l.patient_id=a.patient_id
    WHERE a.id=$1 AND b.organization_id=$2 AND l.account_id=$3 AND l.revoked_at IS NULL AND l.access_level='full'${lock?" FOR UPDATE OF a":""}`,
    [id,organizationId,accountId])).rows[0];if(!row)throw new ApiException(HttpStatus.FORBIDDEN,"PORTAL_APPOINTMENT_ACCESS_DENIED",
    "Appointment is unavailable to this portal account");return row;}
  private async findIntakeByToken(client:PoolClient,hash:string,lock=false){const row=(await client.query<IntakeRow>(`SELECT s.id,s.organization_id AS "organizationId",
    s.patient_id AS "patientId",s.status,s.expires_at AS "expiresAt",v.fields FROM intake_submissions s
    JOIN intake_form_versions v ON v.id=s.form_version_id WHERE s.access_token_hash=$1${lock?" FOR UPDATE OF s":""}`,[hash])).rows[0];
    if(!row)throw notFound("INTAKE_LINK_INVALID","Intake link is invalid");if(row.expiresAt.getTime()<=Date.now() && row.status!=="reviewed")
      throw new ApiException(HttpStatus.GONE,"INTAKE_LINK_EXPIRED","Intake link has expired");return row;}
  private async findReview(client:PoolClient,hash:string,lock=false){const row=(await client.query<{id:string;organizationId:string;status:string;expiresAt:Date;
    clinicName:string;destinationUrl:string|null}>(`SELECT r.id,r.organization_id AS "organizationId",r.status,r.expires_at AS "expiresAt",
    o.name AS "clinicName",d.url AS "destinationUrl" FROM review_requests r JOIN organizations o ON o.id=r.organization_id
    LEFT JOIN review_destinations d ON d.id=r.destination_id WHERE r.token_hash=$1${lock?" FOR UPDATE OF r":""}`,[hash])).rows[0];
    if(!row)throw notFound("REVIEW_LINK_INVALID","Review link is invalid");if(row.status==="pending" && row.expiresAt.getTime()<=Date.now()){
      await client.query("UPDATE review_requests SET status='expired' WHERE id=$1",[row.id]);row.status="expired";}return row;}
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,entityType:string,id:string,after:unknown,
    organizationId:string,reason?:string){await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType,entityId:id,after,
      ...(reason?{reason}:{}),requestId:auth.requestId});await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,aggregateId:id,
      eventType,payload:{entityId:id,organizationId},requestId:auth.requestId});}
}

function issueToken(tenantId:string){const secret=randomBytes(32).toString("hex");return {token:`${tenantId}.${secret}`,hash:hash(secret)};}
function parseToken(token:string,code:string):TokenParts{const [tenantId,secret,...rest]=token.split(".");if(rest.length || !tenantId || !secret ||
  !/^[0-9a-f-]{36}$/i.test(tenantId) || !/^[0-9a-f]{64}$/i.test(secret))throw notFound(code,"Secure link is invalid");return {tenantId,hash:hash(secret)};}
function hash(value:string){return createHash("sha256").update(value).digest("hex");}
function hoursFromNow(hours:number){return new Date(Date.now()+hours*3_600_000);}
function daysFromNow(days:number){return new Date(Date.now()+days*86_400_000);}
function normalizePhone(value:string){return value.replace(/\D/g,"");}
function normalizeContact(type:"email"|"phone",value:string){return type==="email"?value.trim().toLowerCase():normalizePhone(value);}
function maskContact(type:string,value:string){if(type==="email"){const [name,domain]=value.split("@");return `${name?.slice(0,2) ?? ""}***@${domain ?? ""}`;}
  return `${value.slice(0,3)}***${value.slice(-2)}`;}
function renderTemplate(template:string,variables:Record<string,string|number|boolean|null>){return template.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g,
  (_match,key:string)=>key in variables?String(variables[key] ?? ""):"");}
async function assertPatient(client:PoolClient,id:string){if(!(await client.query("SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL",[id])).rows[0])
  throw notFound("PATIENT_NOT_FOUND","Patient not found");}
function validateAnswers(fields:Array<Record<string,unknown>>,input:SubmitIntakeInput){const known=new Set(fields.map((field)=>String(field.key)));
  for(const field of fields)if(field.required && (input.answers[String(field.key)]===undefined || input.answers[String(field.key)]===null ||
    input.answers[String(field.key)]===""))throw bad("INTAKE_REQUIRED_FIELD_MISSING",`Required field is missing: ${String(field.key)}`);
  for(const key of Object.keys(input.answers))if(!known.has(key))throw bad("INTAKE_UNKNOWN_FIELD",`Unknown intake field: ${key}`);
  for(const upload of input.uploads)if(!known.has(upload.fieldKey))throw bad("INTAKE_UNKNOWN_FIELD",`Unknown upload field: ${upload.fieldKey}`);}
async function applyConfirmedPatientData(client:PoolClient,patientId:string,data:Record<string,unknown>,userId:string){
  const first=typeof data.firstName==="string"?data.firstName.trim():null,last=typeof data.lastName==="string"?data.lastName.trim():null;
  const middle=typeof data.middleName==="string"?data.middleName.trim():null,email=typeof data.email==="string"?data.email.trim():null;
  const phone=typeof data.phone==="string"?data.phone.trim():null,birth=typeof data.birthDate==="string" && /^\d{4}-\d{2}-\d{2}$/.test(data.birthDate)?data.birthDate:null;
  const sex=["female","male","unknown"].includes(String(data.sex))?String(data.sex):null;
  await client.query(`UPDATE patients SET first_name=COALESCE($2,first_name),last_name=COALESCE($3,last_name),
    middle_name=COALESCE($4,middle_name),birth_date=COALESCE($5::date,birth_date),sex=COALESCE($6,sex),
    phone=COALESCE($7,phone),phone_normalized=COALESCE($8,phone_normalized),email=COALESCE($9,email),updated_at=now(),updated_by=$10,version=version+1
    WHERE id=$1`,[patientId,first || null,last || null,middle || null,birth,sex,phone || null,phone?normalizePhone(phone):null,email || null,userId]);}
function isDatabaseConflict(error:unknown){return typeof error==="object" && error!==null && "code" in error && ["23P01","23505","23503"].includes(String(error.code));}
function bad(code:string,message:string){return new ApiException(HttpStatus.BAD_REQUEST,code,message);}
function conflict(code:string,message:string){return new ApiException(HttpStatus.CONFLICT,code,message);}
function notFound(code:string,message:string){return new ApiException(HttpStatus.NOT_FOUND,code,message);}
