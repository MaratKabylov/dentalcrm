-- Local-only authentication adapter and revocable application sessions.

CREATE TABLE local_credentials (
  tenant_id uuid NOT NULL REFERENCES tenants(id),user_id uuid NOT NULL REFERENCES users(id),username varchar(64) NOT NULL,
  password_hash char(128) NOT NULL,password_salt char(32) NOT NULL,failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts>=0),
  locked_until timestamptz,last_login_at timestamptz,password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,user_id),UNIQUE(tenant_id,username),CHECK(username=lower(username)),
  FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id)
);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,user_id uuid NOT NULL,membership_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,ip inet,user_agent varchar(1000),created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,revoked_at timestamptz,
  UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id),CHECK(expires_at>created_at)
);

CREATE INDEX user_sessions_active_idx ON user_sessions(tenant_id,user_id,expires_at) WHERE revoked_at IS NULL;

ALTER TABLE local_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON local_credentials
  USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_sessions
  USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);

GRANT SELECT,INSERT,UPDATE ON local_credentials,user_sessions TO dental_app;
GRANT DELETE ON user_sessions,membership_roles TO dental_app;
