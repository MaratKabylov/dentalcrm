import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl=process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("recall and waitlist invariants",()=>{
  const client=new pg.Client({connectionString:databaseUrl});
  const tenantId=randomUUID(),organizationId=randomUUID(),branchId=randomUUID();
  const patientA=randomUUID(),patientB=randomUUID(),patientC=randomUUID(),employeeId=randomUUID(),doctorId=randomUUID(),serviceId=randomUUID();
  let appointmentId="",completedAppointmentId="",entryB="",entryC="";

  beforeAll(async()=>{
    await client.connect();await client.query("BEGIN");
    await client.query("INSERT INTO tenants(id,slug,name) VALUES($1,$2,'Recall waitlist tenant')",[tenantId,`engagement-${tenantId}`]);
    await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    await client.query("INSERT INTO organizations(id,tenant_id,code,name) VALUES($1,$2,'main','Main')",[organizationId,tenantId]);
    await client.query("INSERT INTO branches(id,tenant_id,organization_id,code,name,timezone) VALUES($1,$2,$3,'main','Main','Asia/Almaty')",
      [branchId,tenantId,organizationId]);
    await client.query(`INSERT INTO patients(id,tenant_id,first_name,last_name,phone,phone_normalized) VALUES
      ($1,$4,'Source','Patient','1','1'),($2,$4,'First','Candidate','2','2'),($3,$4,'Second','Candidate','3','3')`,
      [patientA,patientB,patientC,tenantId]);
    await client.query("INSERT INTO employees(id,tenant_id,first_name,last_name) VALUES($1,$2,'Test','Doctor')",[employeeId,tenantId]);
    await client.query("INSERT INTO employee_branches(tenant_id,employee_id,branch_id) VALUES($1,$2,$3)",[tenantId,employeeId,branchId]);
    await client.query("INSERT INTO doctors(id,tenant_id,employee_id,specialty) VALUES($1,$2,$3,'hygiene')",[doctorId,tenantId,employeeId]);
    await client.query(`INSERT INTO services(id,tenant_id,organization_id,code,name,duration_minutes)
      VALUES($1,$2,$3,'cleaning','Cleaning',60)`,[serviceId,tenantId,organizationId]);
    appointmentId=(await client.query<{id:string}>(`INSERT INTO appointments(tenant_id,patient_id,doctor_id,branch_id,starts_at,ends_at,status)
      VALUES($1,$2,$3,$4,'2030-01-10T04:00:00Z','2030-01-10T05:00:00Z','cancelled') RETURNING id`,
      [tenantId,patientA,doctorId,branchId])).rows[0]!.id;
    completedAppointmentId=(await client.query<{id:string}>(`INSERT INTO appointments(tenant_id,patient_id,doctor_id,branch_id,starts_at,ends_at,status)
      VALUES($1,$2,$3,$4,'2029-01-10T04:00:00Z','2029-01-10T05:00:00Z','completed') RETURNING id`,
      [tenantId,patientA,doctorId,branchId])).rows[0]!.id;
    await client.query(`INSERT INTO appointment_services(tenant_id,appointment_id,service_id) VALUES($1,$2,$4),($1,$3,$4)`,
      [tenantId,appointmentId,completedAppointmentId,serviceId]);
    await client.query(`INSERT INTO recall_types(tenant_id,organization_id,code,name,service_id,interval_days)
      VALUES($1,$2,'cleaning','Cleaning recall',$3,180)`,[tenantId,organizationId,serviceId]);
    entryB=await insertEntry(patientB);entryC=await insertEntry(patientC);
  });

  afterAll(async()=>{await client.query("ROLLBACK");await client.end();});

  async function insertEntry(patientId:string){return (await client.query<{id:string}>(`INSERT INTO waitlist_entries
    (tenant_id,organization_id,patient_id,date_from,date_to,desired_duration_minutes)
    VALUES($1,$2,$3,'2030-01-01','2030-01-31',45) RETURNING id`,[tenantId,organizationId,patientId])).rows[0]!.id;}

  it("creates a recall only once for one rule and source appointment",async()=>{
    const insert=()=>client.query(`INSERT INTO recalls(tenant_id,organization_id,branch_id,recall_type_id,patient_id,source_appointment_id,due_on)
      SELECT $1,b.organization_id,a.branch_id,t.id,a.patient_id,a.id,((a.ends_at AT TIME ZONE b.timezone)::date+t.interval_days)
      FROM appointments a JOIN branches b ON b.id=a.branch_id
      JOIN recall_types t ON t.organization_id=b.organization_id AND t.active AND t.archived_at IS NULL
      WHERE a.id=$2 AND a.status='completed' AND (t.service_id IS NULL OR EXISTS(
        SELECT 1 FROM appointment_services aps WHERE aps.appointment_id=a.id AND aps.service_id=t.service_id))
      ON CONFLICT(tenant_id,recall_type_id,source_appointment_id) WHERE source_appointment_id IS NOT NULL DO NOTHING RETURNING id`,
      [tenantId,completedAppointmentId]);
    const recall=(await insert()).rows[0] as {id:string};expect(recall).toBeDefined();expect((await insert()).rowCount).toBe(0);
    await client.query("UPDATE recalls SET status='booked',booked_appointment_id=$2 WHERE id=$1",[recall.id,completedAppointmentId]);
    await expect(client.query("UPDATE recalls SET status='completed',completed_at=now() WHERE id=$1",[recall.id])).resolves.toBeDefined();
  });

  it("honors structured waitlist preferences when matching a released slot",async()=>{
    await client.query(`INSERT INTO waitlist_preferences(tenant_id,organization_id,waitlist_entry_id,kind,doctor_id)
      VALUES($1,$2,$3,'doctor',$4)`,[tenantId,organizationId,entryB,doctorId]);
    const otherDoctor=randomUUID(),otherEmployee=randomUUID();
    await client.query("INSERT INTO employees(id,tenant_id,first_name,last_name) VALUES($1,$2,'Other','Doctor')",[otherEmployee,tenantId]);
    await client.query("INSERT INTO doctors(id,tenant_id,employee_id,specialty) VALUES($1,$2,$3,'hygiene')",[otherDoctor,tenantId,otherEmployee]);
    await client.query(`INSERT INTO waitlist_preferences(tenant_id,organization_id,waitlist_entry_id,kind,doctor_id)
      VALUES($1,$2,$3,'doctor',$4)`,[tenantId,organizationId,entryC,otherDoctor]);
    const matches=await client.query<{id:string}>(`SELECT w.id FROM waitlist_entries w
      WHERE w.organization_id=$1 AND w.status='active' AND w.patient_id<>$2
        AND w.date_from<=($3::timestamptz AT TIME ZONE $8)::date AND w.date_to>=($3::timestamptz AT TIME ZONE $8)::date
        AND w.desired_duration_minutes<=extract(epoch FROM ($4::timestamptz-$3::timestamptz))/60
        AND now()+(w.minimum_notice_minutes*interval '1 minute')<=$3::timestamptz
        AND (NOT EXISTS(SELECT 1 FROM waitlist_preferences p WHERE p.waitlist_entry_id=w.id AND p.kind='branch')
          OR EXISTS(SELECT 1 FROM waitlist_preferences p WHERE p.waitlist_entry_id=w.id AND p.kind='branch' AND p.branch_id=$5))
        AND (NOT EXISTS(SELECT 1 FROM waitlist_preferences p WHERE p.waitlist_entry_id=w.id AND p.kind='doctor')
          OR EXISTS(SELECT 1 FROM waitlist_preferences p WHERE p.waitlist_entry_id=w.id AND p.kind='doctor' AND p.doctor_id=$6))
        AND (NOT EXISTS(SELECT 1 FROM waitlist_preferences p WHERE p.waitlist_entry_id=w.id AND p.kind='specialty')
          OR EXISTS(SELECT 1 FROM waitlist_preferences p WHERE p.waitlist_entry_id=w.id AND p.kind='specialty' AND lower(p.specialty)=lower($7)))
        AND (NOT EXISTS(SELECT 1 FROM waitlist_preferences p WHERE p.waitlist_entry_id=w.id AND p.kind='weekday')
          OR EXISTS(SELECT 1 FROM waitlist_preferences p WHERE p.waitlist_entry_id=w.id AND p.kind='weekday'
            AND p.weekday=extract(isodow FROM ($3::timestamptz AT TIME ZONE $8))))
        AND (NOT EXISTS(SELECT 1 FROM waitlist_preferences p WHERE p.waitlist_entry_id=w.id AND p.kind='time_range')
          OR EXISTS(SELECT 1 FROM waitlist_preferences p WHERE p.waitlist_entry_id=w.id AND p.kind='time_range'
            AND p.starts_at<=($3::timestamptz AT TIME ZONE $8)::time AND p.ends_at>=($4::timestamptz AT TIME ZONE $8)::time))`,
      [organizationId,patientA,new Date("2030-01-10T04:00:00Z"),new Date("2030-01-10T05:00:00Z"),branchId,doctorId,"hygiene","Asia/Almaty"]);
    expect(matches.rows.map((row)=>row.id)).toContain(entryB);expect(matches.rows.map((row)=>row.id)).not.toContain(entryC);
  });

  it("allows only one patient to atomically occupy an offered slot",async()=>{
    const offers:Array<{id:string;patientId:string;entryId:string}>=[];
    for(const [entryId,patientId] of [[entryB,patientB],[entryC,patientC]]){const secret=randomUUID();offers.push((await client.query(
      `INSERT INTO waitlist_offers(tenant_id,organization_id,waitlist_entry_id,source_appointment_id,patient_id,branch_id,doctor_id,
       starts_at,ends_at,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'2030-01-10T04:00:00Z','2030-01-10T05:00:00Z',$8,
       '2030-01-10T03:30:00Z') RETURNING id,patient_id AS "patientId",waitlist_entry_id AS "entryId"`,
      [tenantId,organizationId,entryId,appointmentId,patientId,branchId,doctorId,createHash("sha256").update(secret).digest("hex")])).rows[0] as typeof offers[number]);}
    const firstAppointment=(await client.query<{id:string}>(`INSERT INTO appointments(tenant_id,patient_id,doctor_id,branch_id,starts_at,ends_at,source)
      VALUES($1,$2,$3,$4,'2030-01-10T04:00:00Z','2030-01-10T05:00:00Z','web') RETURNING id`,
      [tenantId,patientB,doctorId,branchId])).rows[0]!.id;
    await client.query("UPDATE waitlist_offers SET status='accepted',appointment_id=$2,responded_at=now() WHERE id=$1",[offers[0]!.id,firstAppointment]);
    await client.query("SAVEPOINT second_booking");
    await expect(client.query(`INSERT INTO appointments(tenant_id,patient_id,doctor_id,branch_id,starts_at,ends_at,source)
      VALUES($1,$2,$3,$4,'2030-01-10T04:00:00Z','2030-01-10T05:00:00Z','web')`,[tenantId,patientC,doctorId,branchId]))
      .rejects.toMatchObject({code:"23P01"});
    await client.query("ROLLBACK TO SAVEPOINT second_booking");
  });
});
