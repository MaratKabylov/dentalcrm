import { createHash,randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg,{type PoolClient} from "pg";

const databaseUrl=process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";
const appRole=process.env.DB_APP_ROLE ?? "dental_app";
if(!/^[a-z_][a-z0-9_]*$/.test(appRole))throw new Error("DB_APP_ROLE is invalid");
const pool=new pg.Pool({connectionString:databaseUrl,max:Number(process.env.DB_POOL_MAX ?? 2),allowExitOnIdle:true,
  connectionTimeoutMillis:10_000,idleTimeoutMillis:20_000});let stopping=false;
const messagingWebhookUrl=process.env.MESSAGING_WEBHOOK_URL;
const messagingWebhookToken=process.env.MESSAGING_WEBHOOK_TOKEN;
export async function runWorkerBatch(maxPasses=10):Promise<{processed:number}>{let total=0;
  for(let pass=0;pass<maxPasses;pass+=1){const tenants=await pool.query<{id:string}>("SELECT id FROM tenants WHERE status='active'");let processed=0;
    for(const tenant of tenants.rows){processed+=await processNextOutbox(tenant.id);processed+=await processNextWorkflow(tenant.id);
      processed+=await processNextNotification(tenant.id);}total+=processed;if(processed===0)break;}
  return {processed:total};}

async function runContinuously(){process.on("SIGINT",()=>{stopping=true;});process.on("SIGTERM",()=>{stopping=true;});
  while(!stopping){const result=await runWorkerBatch(1);if(result.processed===0)await delay(1_000);}await pool.end();}

const entry=process.argv[1];
if(entry && resolve(entry)===fileURLToPath(import.meta.url))await runContinuously();

async function beginTenant(client:PoolClient,tenantId:string){await client.query("BEGIN");await client.query(`SET LOCAL ROLE ${appRole}`);
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);}

async function processNextOutbox(tenantId:string):Promise<number>{const client=await pool.connect();try{await beginTenant(client,tenantId);
    const event=(await client.query<{id:string;event_type:string;payload:Record<string,unknown>;occurred_at:Date}>(`SELECT id,event_type,payload,occurred_at
      FROM outbox_events WHERE processed_at IS NULL AND available_at<=now() ORDER BY occurred_at FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
    if(!event){await client.query("COMMIT");return 0;}await deliverIdempotently(client,tenantId,event);
    await client.query("UPDATE outbox_events SET processed_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",[event.id]);
    await client.query("COMMIT");return 1;
  }catch(error){await client.query("ROLLBACK");console.error("Outbox delivery failed",message(error));return 0;}finally{client.release();}}

async function deliverIdempotently(client:PoolClient,tenantId:string,event:{id:string;event_type:string;payload:Record<string,unknown>;occurred_at:Date}){
  await deliver(client,tenantId,event.id,"workflow-enqueue",async()=>enqueueWorkflows(client,tenantId,event));
  await deliver(client,tenantId,event.id,"recall-scheduler",async()=>scheduleRecalls(client,tenantId,event));
  await deliver(client,tenantId,event.id,"waitlist-matcher",async()=>matchWaitlist(client,tenantId,event));
  await deliver(client,tenantId,event.id,"inventory-consumption-planner",async()=>planMaterialConsumption(client,tenantId,event));
  await deliver(client,tenantId,event.id,"foundation-console-handler",async()=>console.info(JSON.stringify({message:"domain_event_delivered",tenantId,
    eventType:event.event_type,payload:redact(event.payload)})));
}

async function planMaterialConsumption(client:PoolClient,tenantId:string,event:{id:string;event_type:string;payload:Record<string,unknown>}){
  if(event.event_type!=="ProcedureCompleted")return;const procedureId=event.payload.procedureId;
  if(typeof procedureId!=="string" || !isUuid(procedureId))return;
  const source=(await client.query<{organization_id:string;recipe_id:string;procedure_quantity:number}>(`SELECT b.organization_id,
    r.id AS recipe_id,p.quantity AS procedure_quantity FROM procedures p JOIN encounters e ON e.id=p.encounter_id
    JOIN branches b ON b.id=e.branch_id JOIN service_material_recipes r ON r.organization_id=b.organization_id
      AND r.service_id=p.service_id AND r.active WHERE p.id=$1 AND p.status='completed'`,[procedureId])).rows[0];
  if(!source)return;
  const consumption=(await client.query<{id:string}>(`INSERT INTO material_consumptions(tenant_id,organization_id,procedure_id)
    VALUES($1,$2,$3) ON CONFLICT(tenant_id,procedure_id) DO NOTHING RETURNING id`,[tenantId,source.organization_id,procedureId])).rows[0];
  if(!consumption)return;
  await client.query(`INSERT INTO material_consumption_lines(tenant_id,organization_id,consumption_id,product_id,planned_quantity)
    SELECT $1,$2,$3,i.product_id,i.quantity*$4 FROM service_material_recipe_items i WHERE i.recipe_id=$5`,
    [tenantId,source.organization_id,consumption.id,source.procedure_quantity,source.recipe_id]);
  const requestId=`inventory:${event.id}:${consumption.id}`;
  await client.query(`INSERT INTO outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,payload,request_id)
    VALUES($1,'material_consumption',$2,'MaterialConsumptionPlanned',$3::jsonb,$4)`,[tenantId,consumption.id,
    JSON.stringify({materialConsumptionId:consumption.id,procedureId,organizationId:source.organization_id}),requestId]);
  await appendAudit(client,{tenantId,action:"material_consumption.planned",entityType:"material_consumption",entityId:consumption.id,
    after:{procedureId,organizationId:source.organization_id,status:"planned"},requestId});
}

async function deliver(client:PoolClient,tenantId:string,eventId:string,handler:string,operation:()=>Promise<void>){const claimed=await client.query(
  `INSERT INTO outbox_deliveries(tenant_id,event_id,handler) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id`,[tenantId,eventId,handler]);
  if(claimed.rowCount===0)return;await operation();}

async function enqueueWorkflows(client:PoolClient,tenantId:string,event:{id:string;event_type:string;payload:Record<string,unknown>;occurred_at:Date}){
  const organizationId=event.payload.organizationId;if(typeof organizationId!=="string" || !isUuid(organizationId))return;
  await client.query(`INSERT INTO workflow_runs(tenant_id,organization_id,rule_id,event_id,event_type,event_payload,scheduled_at)
    SELECT $1::uuid,r.organization_id,r.id,$2::uuid,$3::varchar(128),$4::jsonb,$5::timestamptz+(r.delay_seconds*interval '1 second')
    FROM workflow_rules r WHERE r.organization_id=$6::uuid AND r.event_type=$3::varchar(128) AND r.active AND r.archived_at IS NULL
    ON CONFLICT(tenant_id,rule_id,event_id) DO NOTHING`,[tenantId,event.id,event.event_type,JSON.stringify(event.payload),event.occurred_at,organizationId]);
}

async function scheduleRecalls(client:PoolClient,tenantId:string,event:{id:string;event_type:string;payload:Record<string,unknown>}){
  if(event.event_type!=="AppointmentCompleted")return;const appointmentId=event.payload.appointmentId;
  if(typeof appointmentId!=="string" || !isUuid(appointmentId))return;
  const rows=(await client.query<{id:string;organization_id:string;patient_id:string;due_on:string}>(`INSERT INTO recalls
    (tenant_id,organization_id,branch_id,recall_type_id,patient_id,source_appointment_id,due_on)
    SELECT $1,b.organization_id,a.branch_id,t.id,a.patient_id,a.id,
      ((a.ends_at AT TIME ZONE b.timezone)::date+t.interval_days)
    FROM appointments a JOIN branches b ON b.id=a.branch_id
    JOIN recall_types t ON t.organization_id=b.organization_id AND t.active AND t.archived_at IS NULL
    WHERE a.id=$2 AND a.status='completed' AND (t.service_id IS NULL OR EXISTS(
      SELECT 1 FROM appointment_services aps WHERE aps.appointment_id=a.id AND aps.service_id=t.service_id))
    ON CONFLICT(tenant_id,recall_type_id,source_appointment_id) WHERE source_appointment_id IS NOT NULL DO NOTHING
    RETURNING id,organization_id,patient_id,due_on`,[tenantId,appointmentId])).rows;
  for(const recall of rows){const requestId=`recall:${event.id}:${recall.id}`;await client.query(`INSERT INTO outbox_events
      (tenant_id,aggregate_type,aggregate_id,event_type,payload,request_id) VALUES($1,'recall',$2,'RecallScheduled',$3::jsonb,$4)`,
      [tenantId,recall.id,JSON.stringify({recallId:recall.id,organizationId:recall.organization_id,patientId:recall.patient_id,dueOn:recall.due_on}),requestId]);
    await appendAudit(client,{tenantId,action:"recall.scheduled",entityType:"recall",entityId:recall.id,
      after:{appointmentId,patientId:recall.patient_id,dueOn:recall.due_on},requestId});}
}

async function matchWaitlist(client:PoolClient,tenantId:string,event:{id:string;event_type:string;payload:Record<string,unknown>}){
  if(event.event_type!=="AppointmentCancelled")return;const appointmentId=event.payload.appointmentId;
  if(typeof appointmentId!=="string" || !isUuid(appointmentId))return;
  const slot=(await client.query<{organization_id:string;patient_id:string;branch_id:string;doctor_id:string;room_id:string|null;chair_id:string|null;
    starts_at:Date;ends_at:Date;timezone:string;specialty:string|null}>(`SELECT b.organization_id,a.patient_id,a.branch_id,a.doctor_id,a.room_id,a.chair_id,
      a.starts_at,a.ends_at,b.timezone,d.specialty FROM appointments a JOIN branches b ON b.id=a.branch_id JOIN doctors d ON d.id=a.doctor_id
      WHERE a.id=$1 AND a.status='cancelled'`,[appointmentId])).rows[0];
  if(!slot || slot.starts_at.getTime()<=Date.now())return;
  const candidates=(await client.query<{id:string;patient_id:string}>(`SELECT w.id,w.patient_id FROM waitlist_entries w
    WHERE w.organization_id=$1 AND w.status='active' AND w.patient_id<>$2
      AND (w.date_from<=($3::timestamptz AT TIME ZONE $8)::date AND w.date_to>=($3::timestamptz AT TIME ZONE $8)::date)
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
          AND p.starts_at<=($3::timestamptz AT TIME ZONE $8)::time AND p.ends_at>=($4::timestamptz AT TIME ZONE $8)::time))
    ORDER BY w.priority DESC,w.created_at LIMIT 50`,[slot.organization_id,slot.patient_id,slot.starts_at,slot.ends_at,slot.branch_id,
      slot.doctor_id,slot.specialty ?? "",slot.timezone])).rows;
  for(const candidate of candidates){const secret=randomUUID(),tokenHash=createHash("sha256").update(secret).digest("hex");
    const expiresAt=new Date(Math.min(slot.starts_at.getTime(),Date.now()+30*60*1000));
    const offer=(await client.query<{id:string}>(`INSERT INTO waitlist_offers(tenant_id,organization_id,waitlist_entry_id,
      source_appointment_id,patient_id,branch_id,doctor_id,room_id,chair_id,starts_at,ends_at,token_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT(tenant_id,waitlist_entry_id,source_appointment_id) DO NOTHING RETURNING id`,[tenantId,slot.organization_id,candidate.id,
      appointmentId,candidate.patient_id,slot.branch_id,slot.doctor_id,slot.room_id,slot.chair_id,slot.starts_at,slot.ends_at,tokenHash,expiresAt])).rows[0];
    if(!offer)continue;const publicToken=`${tenantId}.${secret}`,requestId=`waitlist:${event.id}:${offer.id}`;
    await client.query(`INSERT INTO outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,payload,request_id)
      VALUES($1,'waitlist_offer',$2,'WaitlistSlotAvailable',$3::jsonb,$4)`,[tenantId,offer.id,JSON.stringify({offerId:offer.id,
        waitlistEntryId:candidate.id,organizationId:slot.organization_id,patientId:candidate.patient_id,branchId:slot.branch_id,
        startsAt:slot.starts_at.toISOString(),endsAt:slot.ends_at.toISOString(),expiresAt:expiresAt.toISOString(),bookingToken:publicToken}),requestId]);
    await appendAudit(client,{tenantId,action:"waitlist_offer.created",entityType:"waitlist_offer",entityId:offer.id,
      after:{waitlistEntryId:candidate.id,sourceAppointmentId:appointmentId,startsAt:slot.starts_at.toISOString(),expiresAt:expiresAt.toISOString()},requestId});}
}

async function processNextWorkflow(tenantId:string):Promise<number>{const client=await pool.connect();try{await beginTenant(client,tenantId);
    const run=(await client.query<{id:string;organization_id:string;rule_id:string;event_type:string;event_payload:Record<string,unknown>}>(`SELECT id,
      organization_id,rule_id,event_type,event_payload FROM workflow_runs WHERE status='pending' AND scheduled_at<=now()
      ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];if(!run){await client.query("COMMIT");return 0;}
    await client.query("UPDATE workflow_runs SET status='running',started_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",[run.id]);
    await client.query("SAVEPOINT workflow_actions");
    try{const conditions=(await client.query<{field_path:string;operator:string;expected_value:unknown}>(`SELECT field_path,operator,expected_value
        FROM workflow_rule_conditions WHERE rule_id=$1 ORDER BY position`,[run.rule_id])).rows;
      if(!conditions.every((condition)=>matches(run.event_payload,condition))){await client.query("ROLLBACK TO SAVEPOINT workflow_actions");
        await log(client,tenantId,run.organization_id,run.id,null,"info","Workflow conditions did not match");
        await client.query("UPDATE workflow_runs SET status='skipped',finished_at=now() WHERE id=$1",[run.id]);await client.query("COMMIT");return 1;}
      const actions=(await client.query<{id:string;action_type:string;configuration:Record<string,unknown>}>(`SELECT id,action_type,configuration
        FROM workflow_rule_actions WHERE rule_id=$1 ORDER BY position`,[run.rule_id])).rows;
      for(const action of actions){if(action.action_type!=="CREATE_TASK")throw new Error(`Unsupported workflow action ${action.action_type}`);
        await createTask(client,tenantId,run,action.id,action.configuration);}
      await client.query("UPDATE workflow_runs SET status='succeeded',finished_at=now() WHERE id=$1",[run.id]);await client.query("COMMIT");return 1;
    }catch(error){await client.query("ROLLBACK TO SAVEPOINT workflow_actions");const errorMessage=message(error);
      await log(client,tenantId,run.organization_id,run.id,null,"error","Workflow execution failed",{error:errorMessage});
      await client.query("UPDATE workflow_runs SET status='failed',finished_at=now(),last_error=$2 WHERE id=$1",[run.id,errorMessage]);
      await client.query("COMMIT");return 1;}
  }catch(error){await client.query("ROLLBACK");console.error("Workflow processing failed",message(error));return 0;}finally{client.release();}}

async function processNextNotification(tenantId:string):Promise<number>{if(!messagingWebhookUrl)return 0;const client=await pool.connect();
  try{await beginTenant(client,tenantId);const job=(await client.query<{id:string;organization_id:string;channel:string;recipient:string;
      rendered_subject:string|null;rendered_body:string;correlation_id:string;attempts:number}>(`SELECT id,organization_id,channel,recipient,
      rendered_subject,rendered_body,correlation_id,attempts FROM notification_jobs WHERE status IN ('pending','failed')
      AND scheduled_at<=now() AND attempts<5 ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
    if(!job){await client.query("COMMIT");return 0;}await client.query("UPDATE notification_jobs SET status='processing' WHERE id=$1",[job.id]);
    try{const response=await fetch(messagingWebhookUrl,{method:"POST",headers:{"content-type":"application/json",
        ...(messagingWebhookToken?{authorization:`Bearer ${messagingWebhookToken}`}:{})},body:JSON.stringify({channel:job.channel,
        recipient:job.recipient,subject:job.rendered_subject,body:job.rendered_body,correlationId:job.correlation_id})});
      if(!response.ok)throw new Error(`Messaging provider returned HTTP ${response.status}`);const payload=await safeJson(response);
      const providerMessageId=typeof payload.messageId==="string"?payload.messageId:null;
      await client.query(`INSERT INTO notification_deliveries(tenant_id,organization_id,job_id,provider,provider_message_id,status,safe_response)
        VALUES($1,$2,$3,'webhook',$4,'sent',$5::jsonb)`,[tenantId,job.organization_id,job.id,providerMessageId,
        JSON.stringify({httpStatus:response.status})]);await client.query(`UPDATE notification_jobs SET status='sent',attempts=attempts+1,last_error=NULL
        WHERE id=$1`,[job.id]);await client.query("COMMIT");return 1;
    }catch(error){const attempt=job.attempts+1,nextDelaySeconds=Math.min(3600,30*(2**job.attempts));await client.query(`UPDATE notification_jobs
        SET status=CASE WHEN $2>=5 THEN 'dead_letter' ELSE 'failed' END,attempts=$2,last_error=$3,
        scheduled_at=CASE WHEN $2>=5 THEN scheduled_at ELSE now()+($4*interval '1 second') END WHERE id=$1`,
        [job.id,attempt,safeError(error),nextDelaySeconds]);await client.query("COMMIT");return 1;}
  }catch(error){await client.query("ROLLBACK");console.error("Notification processing failed",safeError(error));return 0;}finally{client.release();}}

async function createTask(client:PoolClient,tenantId:string,run:{id:string;organization_id:string;event_payload:Record<string,unknown>},
  actionId:string,config:Record<string,unknown>){if(typeof config.title!=="string" || !config.title.trim())throw new Error("CREATE_TASK title is invalid");
  const branchId=optionalUuid(config.branchId,"branchId"),assignedEmployeeId=optionalUuid(config.assignedEmployeeId,"assignedEmployeeId");
  if(branchId && !(await client.query("SELECT 1 FROM branches WHERE id=$1 AND organization_id=$2",[branchId,run.organization_id])).rows[0])
    throw new Error("CREATE_TASK branch is outside the rule organization");
  if(assignedEmployeeId && !(await client.query(`SELECT 1 FROM employee_branches eb JOIN branches b ON b.id=eb.branch_id
    WHERE eb.employee_id=$1 AND b.organization_id=$2 AND ($3::uuid IS NULL OR b.id=$3) LIMIT 1`,[assignedEmployeeId,run.organization_id,branchId])).rows[0])
    throw new Error("CREATE_TASK assignee is outside the rule organization or branch");
  const priority=typeof config.priority==="string" && ["low","normal","high","urgent"].includes(config.priority)?config.priority:"normal";
  const dueInMinutes=typeof config.dueInMinutes==="number" && Number.isInteger(config.dueInMinutes) && config.dueInMinutes>=0?config.dueInMinutes:null;
  const entityType=typeof config.entityType==="string"?config.entityType:null;let entityId:string|null=null;
  if(entityType){if(typeof config.entityIdPath!=="string")throw new Error("CREATE_TASK entityIdPath is required");const resolved=getPath(run.event_payload,config.entityIdPath);
    if(typeof resolved!=="string" || !isUuid(resolved))throw new Error("CREATE_TASK entityIdPath did not resolve to a UUID");entityId=resolved;}
  const task=(await client.query<{id:string}>(`INSERT INTO tasks(tenant_id,organization_id,branch_id,assigned_employee_id,entity_type,entity_id,
    title,description,priority,due_at,source,source_reference_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,
    CASE WHEN $10::int IS NULL THEN NULL ELSE now()+($10*interval '1 minute') END,'workflow',$11) RETURNING id`,
    [tenantId,run.organization_id,branchId,assignedEmployeeId,entityType,entityId,format(config.title,run.event_payload),
      typeof config.description==="string"?format(config.description,run.event_payload):null,priority,dueInMinutes,run.id])).rows[0]!;
  await client.query("INSERT INTO task_status_history(tenant_id,organization_id,task_id,to_status) VALUES($1,$2,$3,'open')",
    [tenantId,run.organization_id,task.id]);await log(client,tenantId,run.organization_id,run.id,actionId,"info","Task created",{taskId:task.id});
  const requestId=`workflow:${run.id}`;await client.query(`INSERT INTO outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,payload,request_id)
    VALUES($1,'task',$2,'TaskCreated',$3::jsonb,$4)`,[tenantId,task.id,JSON.stringify({taskId:task.id,organizationId:run.organization_id,
      branchId,assignedEmployeeId,workflowRunId:run.id}),requestId]);await appendAudit(client,{tenantId,action:"task.created_by_workflow",entityType:"task",
      entityId:task.id,after:{taskId:task.id,organizationId:run.organization_id,workflowRunId:run.id},requestId});}

async function log(client:PoolClient,tenantId:string,organizationId:string,runId:string,actionId:string|null,level:string,messageText:string,details?:unknown){
  await client.query(`INSERT INTO workflow_run_logs(tenant_id,organization_id,run_id,action_id,level,message,details)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[tenantId,organizationId,runId,actionId,level,messageText,details===undefined?null:JSON.stringify(details)]);}

async function appendAudit(client:PoolClient,entry:{tenantId:string;action:string;entityType:string;entityId:string;after:unknown;requestId:string}){
  const id=randomUUID(),createdAt=new Date(),value={id,createdAt:createdAt.toISOString(),tenantId:entry.tenantId,actorUserId:null,
    action:entry.action,entityType:entry.entityType,entityId:entry.entityId,after:entry.after,requestId:entry.requestId};
  await client.query(`INSERT INTO audit_events(id,tenant_id,actor_user_id,action,entity_type,entity_id,after_snapshot,request_id,created_at,hash)
    VALUES($1,$2,NULL,$3,$4,$5,$6::jsonb,$7,$8,$9)`,[id,entry.tenantId,entry.action,entry.entityType,entry.entityId,
    JSON.stringify(entry.after),entry.requestId,createdAt,createHash("sha256").update(stable(value)).digest("hex")]);}

function matches(payload:Record<string,unknown>,condition:{field_path:string;operator:string;expected_value:unknown}){const actual=getPath(payload,condition.field_path);
  switch(condition.operator){case"equals":return deepEqual(actual,condition.expected_value);case"not_equals":return!deepEqual(actual,condition.expected_value);
    case"exists":return actual!==undefined&&actual!==null;case"in":return Array.isArray(condition.expected_value)&&condition.expected_value.some((v)=>deepEqual(actual,v));default:return false;}}
function getPath(value:unknown,path:string):unknown{return path.split(".").reduce<unknown>((current,key)=>current && typeof current==="object"&&!Array.isArray(current)?
  (current as Record<string,unknown>)[key]:undefined,value);}
function format(template:string,payload:Record<string,unknown>){return template.replace(/\{\{\s*payload\.([a-zA-Z0-9_.]+)\s*\}\}/g,(_all,path:string)=>{
  const value=getPath(payload,path);return value===undefined||value===null?"":String(value);});}
function optionalUuid(value:unknown,name:string){if(value===undefined||value===null)return null;if(typeof value!=="string"||!isUuid(value))throw new Error(`CREATE_TASK ${name} is invalid`);return value;}
function isUuid(value:string){return/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
function deepEqual(a:unknown,b:unknown){return stable(a)===stable(b);}
function stable(value:unknown):string{if(value===undefined)return"null";if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;const record=value as Record<string,unknown>;
  return`{${Object.keys(record).sort().map((key)=>`${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;}
function redact(payload:Record<string,unknown>){return Object.fromEntries(Object.entries(payload).map(([key,value])=>
  [key,key.toLowerCase().includes("token")?"[REDACTED]":value]));}
function message(error:unknown){return error instanceof Error?error.message:String(error);}
function safeError(error:unknown){return message(error).replace(/[\r\n\t]+/g," ").slice(0,500);}
async function safeJson(response:Response):Promise<Record<string,unknown>>{try{const value=await response.json();return value && typeof value==="object" &&
  !Array.isArray(value)?value as Record<string,unknown>:{};}catch{return {};}}
function delay(milliseconds:number){return new Promise<void>((resolve)=>setTimeout(resolve,milliseconds));}
