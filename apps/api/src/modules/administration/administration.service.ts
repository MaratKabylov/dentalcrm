import type { CreateAdminRoleInput,UpdateMembershipAccessInput } from "@dental/contracts";
import { HttpStatus,Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../identity/auth-context.js";

@Injectable()
export class AdministrationService {
  constructor(private readonly database:DatabaseService,private readonly audit:AuditService){}

  access(auth:AuthContext){return this.database.withTenant(auth,async(client)=>{
    const memberships=await client.query(`SELECT m.id,m.user_id AS "userId",u.display_name AS "displayName",u.email,m.status,c.username,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'key',r.key,'name',r.name) ORDER BY r.name) FROM membership_roles mr
          JOIN roles r ON r.id=mr.role_id WHERE mr.membership_id=m.id),'[]') AS roles,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('type',s.scope_type,'organizationId',s.organization_id,'branchId',s.branch_id)
          ORDER BY s.scope_type,s.organization_id,s.branch_id) FROM access_scopes s WHERE s.membership_id=m.id),'[]') AS scopes
        FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN local_credentials c ON c.tenant_id=m.tenant_id AND c.user_id=m.user_id
        ORDER BY u.display_name`);
    const roles=await client.query(`SELECT r.id,r.key,r.name,r.is_system AS "isSystem",COALESCE(array_agg(rp.permission_key ORDER BY rp.permission_key)
        FILTER(WHERE rp.permission_key IS NOT NULL),'{}') AS permissions FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id
        GROUP BY r.id ORDER BY r.is_system DESC,r.name`);
    const permissions=await client.query("SELECT key,description FROM permissions ORDER BY key");
    const organizations=await client.query("SELECT id,code,name FROM organizations WHERE archived_at IS NULL ORDER BY name");
    const branches=await client.query("SELECT id,organization_id AS \"organizationId\",code,name FROM branches WHERE archived_at IS NULL ORDER BY name");
    return {memberships:memberships.rows,roles:roles.rows,permissions:permissions.rows,organizations:organizations.rows,branches:branches.rows};
  });}

  createRole(auth:AuthContext,input:CreateAdminRoleInput){return this.database.withTenant(auth,async(client)=>{
    await this.assertPermissions(client,input.permissions);const role=(await client.query<{id:string}>(`INSERT INTO roles
      (tenant_id,key,name,is_system,created_by,updated_by) VALUES($1,$2,$3,false,$4,$4) RETURNING id,key,name,is_system AS "isSystem"`,
      [auth.tenantId,input.key,input.name,auth.userId])).rows[0]!;for(const permission of input.permissions)await client.query(
        "INSERT INTO role_permissions(tenant_id,role_id,permission_key,created_by) VALUES($1,$2,$3,$4)",[auth.tenantId,role.id,permission,auth.userId]);
    await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action:"role.created",entityType:"role",entityId:role.id,
      after:{...role,permissions:input.permissions},requestId:auth.requestId});return {...role,permissions:input.permissions};
  });}

  updateMembershipAccess(auth:AuthContext,id:string,input:UpdateMembershipAccessInput){return this.database.withTenant(auth,async(client)=>{
    const before=(await client.query<{id:string;userId:string;status:string}>(`SELECT id,user_id AS "userId",status FROM memberships WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!before)throw new ApiException(HttpStatus.NOT_FOUND,"MEMBERSHIP_NOT_FOUND","Membership not found");
    if(id===auth.membershipId && input.status==="suspended")throw conflict("CANNOT_SUSPEND_SELF","You cannot suspend your own membership");
    await this.assertRoles(client,input.roleIds);await this.assertScopes(client,input.organizationIds,input.branchIds);
    const ownerRole=(await client.query<{id:string}>("SELECT id FROM roles WHERE key='owner' AND is_system",[])).rows[0];
    const wasOwner=ownerRole && Boolean((await client.query("SELECT 1 FROM membership_roles WHERE membership_id=$1 AND role_id=$2",[id,ownerRole.id])).rows[0]);
    const remainsOwner=ownerRole && input.roleIds.includes(ownerRole.id) && input.status!=="suspended";
    if(wasOwner && !remainsOwner){const another=(await client.query(`SELECT 1 FROM membership_roles mr JOIN memberships m ON m.id=mr.membership_id
      WHERE mr.role_id=$1 AND mr.membership_id<>$2 AND m.status='active' LIMIT 1`,[ownerRole!.id,id])).rows[0];
      if(!another)throw conflict("LAST_OWNER_REQUIRED","The last active owner cannot be removed or suspended");}
    await client.query("DELETE FROM membership_roles WHERE membership_id=$1",[id]);for(const roleId of input.roleIds)await client.query(
      "INSERT INTO membership_roles(tenant_id,membership_id,role_id,created_by) VALUES($1,$2,$3,$4)",[auth.tenantId,id,roleId,auth.userId]);
    await client.query("DELETE FROM access_scopes WHERE membership_id=$1",[id]);if(input.tenantWide)await client.query(
      "INSERT INTO access_scopes(tenant_id,membership_id,scope_type,created_by) VALUES($1,$2,'tenant',$3)",[auth.tenantId,id,auth.userId]);
    for(const organizationId of input.organizationIds)await client.query(`INSERT INTO access_scopes
      (tenant_id,membership_id,scope_type,organization_id,created_by) VALUES($1,$2,'organization',$3,$4)`,[auth.tenantId,id,organizationId,auth.userId]);
    for(const branchId of input.branchIds)await client.query(`INSERT INTO access_scopes
      (tenant_id,membership_id,scope_type,branch_id,created_by) VALUES($1,$2,'branch',$3,$4)`,[auth.tenantId,id,branchId,auth.userId]);
    if(input.status)await client.query("UPDATE memberships SET status=$2,updated_at=now(),updated_by=$3,version=version+1 WHERE id=$1",
      [id,input.status,auth.userId]);const after={membershipId:id,status:input.status ?? before.status,roleIds:input.roleIds,tenantWide:input.tenantWide,
      organizationIds:input.organizationIds,branchIds:input.branchIds};await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,
      action:"membership.access_updated",entityType:"membership",entityId:id,before,after,requestId:auth.requestId});return after;
  });}

  private async assertPermissions(client:PoolClient,keys:string[]){if(!keys.length)return;const count=Number((await client.query<{count:string}>(
    "SELECT count(*)::text AS count FROM permissions WHERE key=ANY($1::text[])",[keys])).rows[0]!.count);if(count!==new Set(keys).size)
    throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_PERMISSION","Unknown permission requested");}
  private async assertRoles(client:PoolClient,ids:string[]){const count=Number((await client.query<{count:string}>(
    "SELECT count(*)::text AS count FROM roles WHERE id=ANY($1::uuid[])",[ids])).rows[0]!.count);if(count!==new Set(ids).size)
    throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_ROLE","Role is outside the tenant");}
  private async assertScopes(client:PoolClient,organizationIds:string[],branchIds:string[]){const [organizations,branches]=await Promise.all([
    client.query<{count:string}>("SELECT count(*)::text AS count FROM organizations WHERE id=ANY($1::uuid[]) AND archived_at IS NULL",[organizationIds]),
    client.query<{count:string}>("SELECT count(*)::text AS count FROM branches WHERE id=ANY($1::uuid[]) AND archived_at IS NULL",[branchIds])]);
    if(Number(organizations.rows[0]!.count)!==new Set(organizationIds).size || Number(branches.rows[0]!.count)!==new Set(branchIds).size)
      throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_ACCESS_SCOPE","Organization or branch is outside the tenant");}
}

function conflict(code:string,message:string){return new ApiException(HttpStatus.CONFLICT,code,message);}
