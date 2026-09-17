import type { LocalLoginInput } from "@dental/contracts";
import { createHash,randomBytes } from "node:crypto";
import { Injectable,UnauthorizedException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { getEnv } from "../../config/env.js";
import { verifyPassword } from "./password.js";
import { uuidSchema } from "@dental/contracts";

interface CredentialRow {userId:string;membershipId:string;subject:string;displayName:string;passwordHash:string;passwordSalt:string;
  failedAttempts:number;lockedUntil:Date|null}

@Injectable()
export class LocalAuthService {
  constructor(private readonly database:DatabaseService){}

  async login(input:LocalLoginInput,meta:{ip?:string;userAgent?:string}){
    const tenantId=await this.database.findActiveTenantIdBySlug(input.tenant);if(!tenantId){await this.dummyVerify(input.password);throw denied();}
    const result=await this.database.withTenant({tenantId,requestId:"local-login"},async(client)=>{
      const row=(await client.query<CredentialRow>(`SELECT u.id AS "userId",m.id AS "membershipId",u.external_subject AS subject,
        u.display_name AS "displayName",c.password_hash AS "passwordHash",c.password_salt AS "passwordSalt",
        c.failed_attempts AS "failedAttempts",c.locked_until AS "lockedUntil" FROM local_credentials c
        JOIN users u ON u.id=c.user_id JOIN memberships m ON m.tenant_id=c.tenant_id AND m.user_id=c.user_id
        WHERE c.username=$1 AND m.status='active' FOR UPDATE OF c`,[input.username.toLowerCase()])).rows[0];
      if(!row){await this.dummyVerify(input.password);return null;}
      if(row.lockedUntil && row.lockedUntil>new Date())return null;
      if(!(await verifyPassword(input.password,row.passwordHash,row.passwordSalt))){const failures=row.failedAttempts+1;
        await client.query(`UPDATE local_credentials SET failed_attempts=$2,locked_until=CASE WHEN $2>=5 THEN now()+interval '15 minutes' ELSE NULL END,
          updated_at=now() WHERE user_id=$1`,[row.userId,failures]);return null;}
      const secret=randomBytes(32).toString("base64url"),token=`${tenantId}.${secret}`,tokenHash=hashToken(token);
      const expiresAt=new Date(Date.now()+getEnv().LOCAL_SESSION_HOURS*3_600_000);
      await client.query(`INSERT INTO user_sessions(tenant_id,user_id,membership_id,token_hash,ip,user_agent,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[tenantId,row.userId,row.membershipId,tokenHash,meta.ip ?? null,meta.userAgent?.slice(0,1000) ?? null,expiresAt]);
      await client.query("UPDATE local_credentials SET failed_attempts=0,locked_until=NULL,last_login_at=now(),updated_at=now() WHERE user_id=$1",[row.userId]);
      return {token,expiresAt,tenantId,userId:row.userId,displayName:row.displayName};
    });
    if(!result)throw denied();return result;
  }

  async verifySession(token:string):Promise<{tenantId:string;subject:string}>{
    const tenantId=token.split(".",1)[0];if(!tenantId || !uuidSchema.safeParse(tenantId).success)throw denied();
    return this.database.withTenant({tenantId,requestId:"local-session"},async(client)=>{
      const row=(await client.query<{subject:string}>(`UPDATE user_sessions s SET last_seen_at=now() FROM memberships m,users u
        WHERE s.token_hash=$1 AND s.tenant_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()
          AND m.id=s.membership_id AND m.status='active' AND u.id=s.user_id RETURNING u.external_subject AS subject`,
        [hashToken(token),tenantId])).rows[0];if(!row)throw denied();return {tenantId,subject:row.subject};
    });
  }

  async logout(token:string|undefined):Promise<void>{if(!token)return;const tenantId=token.split(".",1)[0];if(!tenantId || !uuidSchema.safeParse(tenantId).success)return;
    await this.database.withTenant({tenantId,requestId:"local-logout"},async(client)=>{await client.query(
      "UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE token_hash=$1",[hashToken(token)]);});}

  private async dummyVerify(password:string){await verifyPassword(password,"0".repeat(128),"0".repeat(32));}
}

function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
function denied(){return new UnauthorizedException("Invalid tenant, username, password, or session");}
