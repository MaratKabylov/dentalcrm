import { randomUUID } from "node:crypto";
import pg,{type PoolClient} from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { DatabaseService } from "../src/database/database.service.js";
import { AdministrationService } from "../src/modules/administration/administration.service.js";
import { AuditService } from "../src/modules/audit/audit.service.js";
import type { AuthContext } from "../src/modules/identity/auth-context.js";
import { LocalAuthService } from "../src/modules/identity/local-auth.service.js";
import { createPasswordHash } from "../src/modules/identity/password.js";

const databaseUrl=process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

describe("local authentication and access administration",()=>{
  const client=new pg.Client({connectionString:databaseUrl});const tenantId=randomUUID(),userId=randomUUID(),membershipId=randomUUID();
  const organizationId=randomUUID(),branchId=randomUUID(),ownerRoleId=randomUUID();let localAuth:LocalAuthService,administration:AdministrationService;
  let auth:AuthContext,token="";
  beforeAll(async()=>{await client.connect();await client.query("BEGIN");
    await client.query("INSERT INTO tenants(id,slug,name) VALUES($1,$2,'Local auth tenant')",[tenantId,`local-auth-${tenantId}`]);
    await client.query("INSERT INTO users(id,external_subject,email,display_name) VALUES($1,$2,'owner@test.local','Local Owner')",[userId,`local:${userId}`]);
    await client.query(`SET LOCAL ROLE ${process.env.DB_APP_ROLE ?? "dental_app"}`);await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    await client.query("INSERT INTO organizations(id,tenant_id,code,name) VALUES($1,$2,'main','Main')",[organizationId,tenantId]);
    await client.query("INSERT INTO branches(id,tenant_id,organization_id,code,name) VALUES($1,$2,$3,'main','Main')",[branchId,tenantId,organizationId]);
    await client.query("INSERT INTO memberships(id,tenant_id,user_id,status) VALUES($1,$2,$3,'active')",[membershipId,tenantId,userId]);
    await client.query("INSERT INTO roles(id,tenant_id,key,name,is_system) VALUES($1,$2,'owner','Owner',true)",[ownerRoleId,tenantId]);
    await client.query("INSERT INTO membership_roles(tenant_id,membership_id,role_id) VALUES($1,$2,$3)",[tenantId,membershipId,ownerRoleId]);
    await client.query("INSERT INTO role_permissions(tenant_id,role_id,permission_key) VALUES($1,$2,'settings.manage')",[tenantId,ownerRoleId]);
    await client.query("INSERT INTO access_scopes(tenant_id,membership_id,scope_type) VALUES($1,$2,'tenant')",[tenantId,membershipId]);
    const password=await createPasswordHash("correct-password");await client.query(`INSERT INTO local_credentials
      (tenant_id,user_id,username,password_hash,password_salt) VALUES($1,$2,'owner',$3,$4)`,[tenantId,userId,password.hash,password.salt]);
    const database={findActiveTenantIdBySlug:async(slug:string)=>slug===`local-auth-${tenantId}`?tenantId:null,
      withTenant:async<T>(_context:unknown,callback:(connection:PoolClient)=>Promise<T>)=>callback(client as unknown as PoolClient)} as DatabaseService;
    localAuth=new LocalAuthService(database);administration=new AdministrationService(database,new AuditService());
    auth={tenantId,userId,membershipId,subject:`local:${userId}`,permissions:new Set(["settings.manage"]),tenantWide:true,
      organizationIds:new Set(),branchIds:new Set(),requestId:randomUUID()};
  });
  afterAll(async()=>{await client.query("ROLLBACK");await client.end();});

  it("rejects a wrong password and persists the failed attempt",async()=>{await expect(localAuth.login(
    {tenant:`local-auth-${tenantId}`,username:"owner",password:"wrong-password"},{})).rejects.toMatchObject({status:401});
    expect((await client.query<{failed:number}>("SELECT failed_attempts AS failed FROM local_credentials WHERE user_id=$1",[userId])).rows[0]!.failed).toBe(1);});
  it("creates an opaque session and resolves the active principal",async()=>{const result=await localAuth.login(
    {tenant:`local-auth-${tenantId}`,username:"OWNER",password:"correct-password"},{ip:"127.0.0.1",userAgent:"vitest"});token=result.token;
    const stored=(await client.query<{hash:string}>("SELECT token_hash AS hash FROM user_sessions WHERE user_id=$1",[userId])).rows[0]!;
    expect(stored.hash).not.toContain(token);await expect(localAuth.verifySession(token)).resolves.toEqual({tenantId,subject:`local:${userId}`});});
  it("lists access and safely updates roles and branch scope",async()=>{const before=await administration.access(auth);expect(before.memberships[0]).toMatchObject({username:"owner",status:"active"});
    const role=await administration.createRole(auth,{key:"reception",name:"Reception",permissions:["patients.read"]});
    const result=await administration.updateMembershipAccess(auth,membershipId,{status:"active",roleIds:[ownerRoleId,role.id],tenantWide:false,
      organizationIds:[],branchIds:[branchId]});expect(result).toMatchObject({tenantWide:false,branchIds:[branchId]});
    expect((await administration.access(auth)).memberships[0]!.roles).toHaveLength(2);});
  it("revokes the local session on logout",async()=>{await localAuth.logout(token);await expect(localAuth.verifySession(token)).rejects.toMatchObject({status:401});});
});
