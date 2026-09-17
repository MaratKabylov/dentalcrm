import { randomUUID } from "node:crypto";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../src/database/database.service.js";
import { AuditService } from "../src/modules/audit/audit.service.js";
import { ExperienceService } from "../src/modules/experience/experience.service.js";
import type { AuthContext } from "../src/modules/identity/auth-context.js";
import { OutboxService } from "../src/modules/outbox/outbox.service.js";

const databaseUrl=process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("patient experience invariants",()=>{
  const client=new pg.Client({connectionString:databaseUrl});
  const tenantId=randomUUID(),userId=randomUUID(),organizationId=randomUUID(),branchId=randomUUID(),employeeId=randomUUID(),doctorId=randomUUID();
  const patientId=randomUUID(),serviceId=randomUUID(),chairId=randomUUID(),roomId=randomUUID();
  let service:ExperienceService;let auth:AuthContext;let firstStart:Date,secondStart:Date;let bookingRuleId="";let bookedAppointmentId="";

  beforeAll(async()=>{await client.connect();await client.query("BEGIN");
    await client.query("INSERT INTO tenants(id,slug,name) VALUES($1,$2,'Experience tenant')",[tenantId,`experience-${tenantId}`]);
    await client.query("INSERT INTO users(id,external_subject,display_name) VALUES($1,$2,'Experience owner')",[userId,`experience-${userId}`]);
    await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    await client.query("INSERT INTO organizations(id,tenant_id,code,name) VALUES($1,$2,'main','Bright Dental')",[organizationId,tenantId]);
    await client.query("INSERT INTO branches(id,tenant_id,organization_id,code,name) VALUES($1,$2,$3,'main','Central')",[branchId,tenantId,organizationId]);
    await client.query("INSERT INTO rooms(id,tenant_id,branch_id,code,name) VALUES($1,$2,$3,'one','Room one')",[roomId,tenantId,branchId]);
    await client.query("INSERT INTO chairs(id,tenant_id,branch_id,room_id,code,name) VALUES($1,$2,$3,$4,'one','Chair one')",[chairId,tenantId,branchId,roomId]);
    await client.query("INSERT INTO employees(id,tenant_id,user_id,first_name,last_name) VALUES($1,$2,$3,'Ada','Doctor')",[employeeId,tenantId,userId]);
    await client.query("INSERT INTO employee_branches(tenant_id,employee_id,branch_id) VALUES($1,$2,$3)",[tenantId,employeeId,branchId]);
    await client.query("INSERT INTO doctors(id,tenant_id,employee_id,specialty) VALUES($1,$2,$3,'therapy')",[doctorId,tenantId,employeeId]);
    await client.query("INSERT INTO services(id,tenant_id,organization_id,code,name,duration_minutes) VALUES($1,$2,$3,'exam','Exam',30)",
      [serviceId,tenantId,organizationId]);
    await client.query("INSERT INTO patients(id,tenant_id,first_name,last_name,phone,phone_normalized) VALUES($1,$2,'Old','Name','77000000001','77000000001')",
      [patientId,tenantId]);
    const future=new Date(Date.now()+10*86_400_000);future.setUTCMinutes(Math.ceil(future.getUTCMinutes()/15)*15,0,0);firstStart=future;
    secondStart=new Date(firstStart.getTime()+2*3_600_000);await client.query(`INSERT INTO schedule_shifts(tenant_id,branch_id,doctor_id,starts_at,ends_at)
      VALUES($1,$2,$3,$4,$5)`,[tenantId,branchId,doctorId,new Date(firstStart.getTime()-3_600_000),new Date(secondStart.getTime()+3_600_000)]);
    const database={withTenant:async<T>(_context:unknown,callback:(connection:PoolClient)=>Promise<T>)=>callback(client as unknown as PoolClient)};
    service=new ExperienceService(database as DatabaseService,new AuditService(),new OutboxService());auth={tenantId,userId,membershipId:randomUUID(),
      subject:"test",permissions:new Set(),tenantWide:true,organizationIds:new Set(),branchIds:new Set(),requestId:randomUUID()};
  });

  afterAll(async()=>{await client.query("ROLLBACK");await client.end();});

  it("publishes server-approved slots and books idempotently",async()=>{const rule=await service.createBookingRule(auth,{organizationId,branchId,doctorId,
    serviceId,chairId,slotIntervalMinutes:15,minimumNoticeMinutes:60,bookingHorizonDays:30,active:true});bookingRuleId=String(rule.id);
    const slots=await service.publishBookingSlots(auth,bookingRuleId,{startsAt:[firstStart.toISOString(),secondStart.toISOString()]});
    expect(slots.published).toHaveLength(2);const firstId=String(slots.published[0]!.id),secondId=String(slots.published[1]!.id);
    const booked=await service.confirmPublicBooking(tenantId,organizationId,"booking-key-one",{slotId:firstId,firstName:"Pat",lastName:"One",
      phone:"+7 700 000 00 02"});bookedAppointmentId=booked.appointmentId;expect(booked.status).toBe("confirmed");
    await expect(service.confirmPublicBooking(tenantId,organizationId,"booking-key-one",{slotId:firstId,firstName:"Changed",lastName:"Input",
      phone:"+7 700 000 00 03"})).resolves.toMatchObject({appointmentId:bookedAppointmentId});
    await client.query(`INSERT INTO appointments(tenant_id,patient_id,doctor_id,branch_id,chair_id,starts_at,ends_at,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,'confirmed')`,[tenantId,patientId,doctorId,branchId,chairId,secondStart,new Date(secondStart.getTime()+1_800_000)]);
    await expect(service.confirmPublicBooking(tenantId,organizationId,"booking-key-two",{slotId:secondId,firstName:"Pat",lastName:"Two",
      phone:"+7 700 000 00 04"})).rejects.toMatchObject({code:"BOOKING_SLOT_UNAVAILABLE"});
  });

  it("keeps portal identity separate and requires a verified family link",async()=>{const invitation=await service.createPortalInvitation(auth,{organizationId,
    patientId,contactType:"email",contact:"family@example.test",relationship:"guardian",evidenceReference:"verified document 42",
    accessLevel:"full",expiresInHours:24});const session=await service.exchangePortalInvitation(invitation.invitationToken);
    const me=await service.portalMe(session.sessionToken);expect(me.patients).toEqual([expect.objectContaining({patientId,relationship:"guardian"})]);
    const summary=await service.portalPatientSummary(session.sessionToken,patientId);expect(summary.patient).toMatchObject({id:patientId,firstName:"Old"});
    await expect(service.portalPatientSummary(session.sessionToken,randomUUID())).rejects.toMatchObject({code:"PORTAL_PATIENT_ACCESS_DENIED"});
  });

  it("does not apply OCR data until patient confirmation and staff review",async()=>{const form=await service.createIntakeForm(auth,{organizationId,code:"identity",
    name:"Identity",fields:[{key:"firstName",label:"First name",type:"text",required:true},{key:"idPhoto",label:"ID",type:"file",required:false}]});
    const issued=await service.issueIntake(auth,form.id,{patientId,expiresInHours:24});await service.submitPublicIntake(issued.accessToken,
      {answers:{firstName:"Old"},uploads:[{fieldKey:"idPhoto",storageKey:"private/id-42",mimeType:"image/jpeg"}]});
    await service.recordOcrResult(auth,issued.submissionId,{provider:"test-ocr",extractedData:{firstName:"Confirmed"},confidence:0.99});
    expect((await client.query<{firstName:string}>(`SELECT first_name AS "firstName" FROM patients WHERE id=$1`,[patientId])).rows[0]!.firstName).toBe("Old");
    await service.confirmPublicOcr(issued.accessToken,{acceptedData:{firstName:"Confirmed"}});
    expect((await client.query<{firstName:string}>(`SELECT first_name AS "firstName" FROM patients WHERE id=$1`,[patientId])).rows[0]!.firstName).toBe("Old");
    await service.reviewIntake(auth,issued.submissionId,{applyToPatient:true,note:"Identity checked"});
    expect((await client.query<{firstName:string}>(`SELECT first_name AS "firstName" FROM patients WHERE id=$1`,[patientId])).rows[0]!.firstName).toBe("Confirmed");
  });

  it("queues provider-neutral notifications and creates recovery work for low feedback",async()=>{const template=await service.createMessageTemplate(auth,
    {organizationId,code:"appointment",name:"Appointment",channel:"sms",locale:"ru",body:"Hello {{name}}"});const job=await service.queueNotification(auth,
    {organizationId,patientId,templateId:template.id,channel:"sms",recipient:"77000000001",variables:{name:"Patient"},correlationId:"appointment-42",
      idempotencyKey:"notify-key-42"});expect(job.status).toBe("pending");
    await client.query("UPDATE appointments SET status='completed' WHERE id=$1",[bookedAppointmentId]);const destination=await service.createReviewDestination(auth,
      {organizationId,name:"Public reviews",url:"https://reviews.example.test/bright",active:true});const request=await service.createReviewRequest(auth,
      {organizationId,appointmentId:bookedAppointmentId,destinationId:destination.id,expiresInDays:14});const feedback=await service.submitPublicReview(
      request.accessToken,{rating:2,comment:"Please call me"});expect(feedback).toMatchObject({status:"submitted",serviceRecoveryCreated:true,
        destinationUrl:"https://reviews.example.test/bright"});expect((await client.query("SELECT 1 FROM tasks WHERE entity_id=$1",[request.reviewRequestId])).rowCount).toBe(1);
  });
});

