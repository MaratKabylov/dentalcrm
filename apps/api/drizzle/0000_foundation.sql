CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dental_app') THEN
    CREATE ROLE dental_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(64) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject varchar(255) NOT NULL UNIQUE,
  email varchar(320),
  display_name varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code varchar(32) NOT NULL,
  name varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  archived_by uuid REFERENCES users(id),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  code varchar(32) NOT NULL,
  name varchar(160) NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'Asia/Almaty',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  archived_by uuid REFERENCES users(id),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, organization_id) REFERENCES organizations(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key varchar(64) NOT NULL,
  name varchar(120) NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (tenant_id, key),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS permissions (
  key varchar(96) PRIMARY KEY,
  description varchar(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  role_id uuid NOT NULL,
  permission_key varchar(96) NOT NULL REFERENCES permissions(key),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  PRIMARY KEY (tenant_id, role_id, permission_key),
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS membership_roles (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  membership_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  PRIMARY KEY (tenant_id, membership_id, role_id),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships(tenant_id, id),
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_user_id uuid REFERENCES users(id),
  actor_employee_id uuid,
  action varchar(96) NOT NULL,
  entity_type varchar(96) NOT NULL,
  entity_id uuid,
  before_snapshot jsonb,
  after_snapshot jsonb,
  reason text,
  ip inet,
  user_agent text,
  request_id varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  hash varchar(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  aggregate_type varchar(96) NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  request_id varchar(128) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text
);

CREATE TABLE IF NOT EXISTS outbox_deliveries (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  event_id uuid NOT NULL REFERENCES outbox_events(id),
  handler varchar(128) NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id, handler)
);

CREATE INDEX IF NOT EXISTS organizations_tenant_idx ON organizations(tenant_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS branches_tenant_org_idx ON branches(tenant_id, organization_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS memberships_tenant_user_idx ON memberships(tenant_id, user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS audit_events_tenant_created_idx ON audit_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx ON outbox_events(available_at, occurred_at) WHERE processed_at IS NULL;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations', 'branches', 'memberships', 'roles', 'role_permissions',
    'membership_roles', 'audit_events', 'outbox_events', 'outbox_deliveries'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        table_name
      );
    END IF;
  END LOOP;
END $$;

INSERT INTO permissions (key, description) VALUES
  ('settings.manage', 'Manage tenant organizations and settings'),
  ('audit.read', 'Read the immutable audit trail')
ON CONFLICT (key) DO NOTHING;

GRANT USAGE ON SCHEMA public TO dental_app;
GRANT SELECT ON tenants, users, permissions TO dental_app;
GRANT SELECT, INSERT, UPDATE ON
  organizations, branches, memberships, roles, role_permissions, membership_roles,
  outbox_events, outbox_deliveries
TO dental_app;
GRANT SELECT, INSERT ON audit_events TO dental_app;
