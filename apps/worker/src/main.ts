import { createHash,randomUUID } from "node:crypto";
import pg,{type PoolClient} from "pg";

const databaseUrl=process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";
const appRole=process.env.DB_APP_ROLE ?? "dental_app";
if(!/^[a-z_][a-z0-9_]*$/.test(appRole))throw new Error("DB_APP_ROLE is invalid");
const pool=new pg.Pool({connectionString:databaseUrl,max:4});let stopping=false;
process.on("SIGINT",()=>{stopping=true;});process.on("SIGTERM",()=>{stopping=true;});

while(!stopping){const tenants=await pool.query<{id:string}>("SELECT id FROM tenants WHERE status='active'");let processed=0;
  for(const tenant of tenants.rows){processed+=await processNextOutbox(tenant.id);processed+=await processNextWorkflow(tenant.id);}
  if(processed===0)await delay(1_000);
}
await pool.end();

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
  await deliver(client,tenantId,event.id,"foundation-console-handler",async()=>console.info(JSON.stringify({message:"domain_event_delivered",tenantId,
    eventType:event.event_type,payload:event.payload})));
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
function message(error:unknown){return error instanceof Error?error.message:String(error);}
function delay(milliseconds:number){return new Promise<void>((resolve)=>setTimeout(resolve,milliseconds));}
