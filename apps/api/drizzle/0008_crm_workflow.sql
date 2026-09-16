-- Phase 4: organization-scoped CRM, tasks, and safe event-driven workflows.

CREATE TABLE lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  code varchar(32) NOT NULL, name varchar(120) NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE lead_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  code varchar(32) NOT NULL, name varchar(120) NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE opportunity_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  key varchar(48) NOT NULL, name varchar(120) NOT NULL, position integer NOT NULL CHECK(position>=0),
  is_initial boolean NOT NULL DEFAULT false, is_terminal boolean NOT NULL DEFAULT false,
  terminal_kind varchar(16) CHECK(terminal_kind IN ('won','lost')),
  active boolean NOT NULL DEFAULT true, is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,key),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  CHECK((is_terminal AND terminal_kind IS NOT NULL) OR (NOT is_terminal AND terminal_kind IS NULL))
);
CREATE UNIQUE INDEX opportunity_stages_one_initial_idx ON opportunity_stages(tenant_id,organization_id) WHERE is_initial AND active;

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  branch_id uuid, source_id uuid, channel_id uuid, patient_id uuid,
  first_name varchar(80) NOT NULL, last_name varchar(80), phone varchar(32) NOT NULL, phone_normalized varchar(32) NOT NULL,
  email varchar(320), status varchar(24) NOT NULL DEFAULT 'new' CHECK(status IN ('new','qualified','converted','lost')),
  interest varchar(500), notes text, lost_reason varchar(1000), converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  archived_at timestamptz, archived_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,source_id) REFERENCES lead_sources(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,channel_id) REFERENCES lead_channels(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  CHECK(status<>'lost' OR lost_reason IS NOT NULL),
  CHECK(status<>'converted' OR (patient_id IS NOT NULL AND converted_at IS NOT NULL))
);

CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  branch_id uuid, lead_id uuid, patient_id uuid NOT NULL, treatment_plan_id uuid, stage_id uuid NOT NULL,
  title varchar(180) NOT NULL, expected_amount_minor bigint CHECK(expected_amount_minor IS NULL OR expected_amount_minor>=0),
  currency char(3) NOT NULL DEFAULT 'KZT', lost_reason varchar(1000), closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  archived_at timestamptz, archived_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,lead_id) REFERENCES leads(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,treatment_plan_id) REFERENCES treatment_plans(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,stage_id) REFERENCES opportunity_stages(tenant_id,organization_id,id)
);

CREATE TABLE opportunity_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  opportunity_id uuid NOT NULL, from_stage_id uuid, to_stage_id uuid NOT NULL, reason varchar(1000), changed_by uuid REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,opportunity_id) REFERENCES opportunities(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,from_stage_id) REFERENCES opportunity_stages(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,to_stage_id) REFERENCES opportunity_stages(tenant_id,organization_id,id)
);

CREATE TABLE crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  branch_id uuid, lead_id uuid, opportunity_id uuid, patient_id uuid,
  activity_type varchar(24) NOT NULL CHECK(activity_type IN ('note','call','message','email','meeting','system')),
  direction varchar(16) CHECK(direction IN ('inbound','outbound')), subject varchar(180), body text,
  occurred_at timestamptz NOT NULL DEFAULT now(), occurred_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,lead_id) REFERENCES leads(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,opportunity_id) REFERENCES opportunities(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  CHECK(lead_id IS NOT NULL OR opportunity_id IS NOT NULL OR patient_id IS NOT NULL)
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  branch_id uuid, assigned_employee_id uuid, entity_type varchar(48), entity_id uuid,
  title varchar(180) NOT NULL, description text, priority varchar(16) NOT NULL DEFAULT 'normal'
    CHECK(priority IN ('low','normal','high','urgent')),
  status varchar(24) NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','cancelled')),
  due_at timestamptz, completed_at timestamptz, completed_by uuid REFERENCES users(id),
  source varchar(24) NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','workflow','system')), source_reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  archived_at timestamptz, archived_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,assigned_employee_id) REFERENCES employees(tenant_id,id),
  CHECK((entity_type IS NULL)=(entity_id IS NULL)),
  CHECK((status='completed' AND completed_at IS NOT NULL) OR (status<>'completed' AND completed_at IS NULL))
);

CREATE TABLE task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  task_id uuid NOT NULL, body text NOT NULL, author_user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,organization_id,task_id) REFERENCES tasks(tenant_id,organization_id,id)
);

CREATE TABLE task_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  task_id uuid NOT NULL, from_status varchar(24), to_status varchar(24) NOT NULL, reason varchar(1000),
  changed_by uuid REFERENCES users(id), changed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,task_id) REFERENCES tasks(tenant_id,organization_id,id)
);

CREATE TABLE workflow_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  name varchar(160) NOT NULL, event_type varchar(128) NOT NULL, delay_seconds integer NOT NULL DEFAULT 0 CHECK(delay_seconds BETWEEN 0 AND 31536000),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  archived_at timestamptz, archived_by uuid REFERENCES users(id), UNIQUE(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE workflow_rule_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  rule_id uuid NOT NULL, field_path varchar(255) NOT NULL, operator varchar(24) NOT NULL CHECK(operator IN ('equals','not_equals','exists','in')),
  expected_value jsonb, position integer NOT NULL CHECK(position>=0), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,rule_id,position),
  FOREIGN KEY(tenant_id,organization_id,rule_id) REFERENCES workflow_rules(tenant_id,organization_id,id)
);

CREATE TABLE workflow_rule_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  rule_id uuid NOT NULL, action_type varchar(48) NOT NULL CHECK(action_type IN ('CREATE_TASK')),
  configuration jsonb NOT NULL, position integer NOT NULL CHECK(position>=0), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,rule_id,position),
  FOREIGN KEY(tenant_id,organization_id,rule_id) REFERENCES workflow_rules(tenant_id,organization_id,id)
);

ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_tenant_id_id_unique UNIQUE(tenant_id,id);

CREATE TABLE workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  rule_id uuid NOT NULL, event_id uuid NOT NULL, status varchar(24) NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','succeeded','failed','skipped')),
  event_type varchar(128) NOT NULL, event_payload jsonb NOT NULL, scheduled_at timestamptz NOT NULL,
  started_at timestamptz, finished_at timestamptz, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,rule_id,event_id),
  FOREIGN KEY(tenant_id,organization_id,rule_id) REFERENCES workflow_rules(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,event_id) REFERENCES outbox_events(tenant_id,id)
);

CREATE TABLE workflow_run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  run_id uuid NOT NULL, action_id uuid, level varchar(16) NOT NULL CHECK(level IN ('info','warning','error')),
  message varchar(500) NOT NULL, details jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,run_id) REFERENCES workflow_runs(tenant_id,id),
  FOREIGN KEY(tenant_id,action_id) REFERENCES workflow_rule_actions(tenant_id,id)
);

CREATE INDEX leads_org_status_created_idx ON leads(tenant_id,organization_id,status,created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX leads_phone_idx ON leads(tenant_id,phone_normalized) WHERE archived_at IS NULL;
CREATE INDEX opportunities_org_stage_idx ON opportunities(tenant_id,organization_id,stage_id,updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX crm_activities_timeline_idx ON crm_activities(tenant_id,organization_id,occurred_at DESC);
CREATE INDEX tasks_org_status_due_idx ON tasks(tenant_id,organization_id,status,due_at) WHERE archived_at IS NULL;
CREATE INDEX workflow_rules_event_idx ON workflow_rules(tenant_id,event_type) WHERE active AND archived_at IS NULL;
CREATE INDEX workflow_runs_due_idx ON workflow_runs(tenant_id,scheduled_at) WHERE status='pending';

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['lead_sources','lead_channels','opportunity_stages','leads','opportunities',
    'opportunity_stage_history','crm_activities','tasks','task_comments','task_status_history','workflow_rules',
    'workflow_rule_conditions','workflow_rule_actions','workflow_runs','workflow_run_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',table_name);
  END LOOP;
END $$;

INSERT INTO opportunity_stages(tenant_id,organization_id,key,name,position,is_initial,is_terminal,terminal_kind,is_system)
SELECT o.tenant_id,o.id,v.key,v.name,v.position,v.is_initial,v.is_terminal,v.terminal_kind,true
FROM organizations o CROSS JOIN (VALUES
  ('new','New',0,true,false,NULL),('contacted','Contacted',10,false,false,NULL),
  ('appointment_booked','Appointment booked',20,false,false,NULL),('visited','Visited',30,false,false,NULL),
  ('plan_created','Plan created',40,false,false,NULL),('plan_presented','Plan presented',50,false,false,NULL),
  ('accepted','Accepted',60,false,false,NULL),('in_treatment','In treatment',70,false,false,NULL),
  ('won','Won',80,false,true,'won'),('lost','Lost',90,false,true,'lost')
) AS v(key,name,position,is_initial,is_terminal,terminal_kind)
ON CONFLICT(tenant_id,organization_id,key) DO NOTHING;

INSERT INTO permissions(key,description) VALUES
  ('crm.read','Read leads, opportunities, and CRM timeline'),('crm.manage','Manage leads and opportunities'),
  ('tasks.read','Read tasks'),('tasks.manage','Create, assign, and transition tasks'),
  ('workflow.read','Read workflow rules and runs'),('workflow.manage','Manage safe workflow rules')
ON CONFLICT(key) DO NOTHING;

GRANT SELECT,INSERT,UPDATE ON lead_sources,lead_channels,opportunity_stages,leads,opportunities,opportunity_stage_history,
  crm_activities,tasks,task_status_history,workflow_rules,workflow_rule_conditions,workflow_rule_actions,workflow_runs,workflow_run_logs TO dental_app;
GRANT SELECT,INSERT ON task_comments TO dental_app;
