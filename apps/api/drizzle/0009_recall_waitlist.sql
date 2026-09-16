-- Phase 5: rule-driven recalls, waitlist matching, and atomic self-booking offers.

CREATE TABLE recall_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  code varchar(32) NOT NULL, name varchar(160) NOT NULL, service_id uuid,
  interval_days integer NOT NULL CHECK(interval_days BETWEEN 1 AND 3650), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  archived_at timestamptz, archived_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,service_id) REFERENCES services(tenant_id,organization_id,id)
);

CREATE TABLE recalls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  branch_id uuid, recall_type_id uuid NOT NULL, patient_id uuid NOT NULL, source_appointment_id uuid,
  due_on date NOT NULL, status varchar(24) NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','due','contacted','booked','completed','cancelled')),
  booked_appointment_id uuid, completed_at timestamptz, cancelled_reason varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  UNIQUE(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,recall_type_id) REFERENCES recall_types(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,source_appointment_id) REFERENCES appointments(tenant_id,id),
  FOREIGN KEY(tenant_id,booked_appointment_id) REFERENCES appointments(tenant_id,id),
  CHECK((status='booked')=(booked_appointment_id IS NOT NULL)),
  CHECK(status<>'completed' OR completed_at IS NOT NULL),
  CHECK(status<>'cancelled' OR cancelled_reason IS NOT NULL)
);
CREATE UNIQUE INDEX recalls_source_rule_unique ON recalls(tenant_id,recall_type_id,source_appointment_id)
  WHERE source_appointment_id IS NOT NULL;

CREATE TABLE recall_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  recall_id uuid NOT NULL, channel varchar(24) NOT NULL CHECK(channel IN ('phone','sms','email','messenger','other')),
  outcome varchar(24) NOT NULL CHECK(outcome IN ('no_answer','contacted','declined','booked')),
  notes text, appointment_id uuid, attempted_at timestamptz NOT NULL DEFAULT now(), attempted_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,recall_id) REFERENCES recalls(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
  CHECK(outcome<>'booked' OR appointment_id IS NOT NULL)
);

CREATE TABLE waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  patient_id uuid NOT NULL, status varchar(24) NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','booked','cancelled','expired')),
  date_from date NOT NULL, date_to date NOT NULL, desired_duration_minutes integer NOT NULL CHECK(desired_duration_minutes BETWEEN 5 AND 720),
  minimum_notice_minutes integer NOT NULL DEFAULT 0 CHECK(minimum_notice_minutes BETWEEN 0 AND 525600),
  priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 100), notes text, cancelled_reason varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  UNIQUE(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  CHECK(date_to>=date_from), CHECK(status<>'cancelled' OR cancelled_reason IS NOT NULL)
);

CREATE TABLE waitlist_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  waitlist_entry_id uuid NOT NULL, kind varchar(24) NOT NULL CHECK(kind IN ('doctor','specialty','branch','weekday','time_range')),
  doctor_id uuid, specialty varchar(120), branch_id uuid, weekday smallint CHECK(weekday BETWEEN 1 AND 7),
  starts_at time, ends_at time, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,waitlist_entry_id) REFERENCES waitlist_entries(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,doctor_id) REFERENCES doctors(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id),
  CHECK((kind='doctor' AND doctor_id IS NOT NULL AND specialty IS NULL AND branch_id IS NULL AND weekday IS NULL AND starts_at IS NULL AND ends_at IS NULL)
    OR (kind='specialty' AND specialty IS NOT NULL AND doctor_id IS NULL AND branch_id IS NULL AND weekday IS NULL AND starts_at IS NULL AND ends_at IS NULL)
    OR (kind='branch' AND branch_id IS NOT NULL AND doctor_id IS NULL AND specialty IS NULL AND weekday IS NULL AND starts_at IS NULL AND ends_at IS NULL)
    OR (kind='weekday' AND weekday IS NOT NULL AND doctor_id IS NULL AND specialty IS NULL AND branch_id IS NULL AND starts_at IS NULL AND ends_at IS NULL)
    OR (kind='time_range' AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at>starts_at
      AND doctor_id IS NULL AND specialty IS NULL AND branch_id IS NULL AND weekday IS NULL))
);

CREATE TABLE waitlist_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  waitlist_entry_id uuid NOT NULL, source_appointment_id uuid NOT NULL, patient_id uuid NOT NULL,
  branch_id uuid NOT NULL, doctor_id uuid NOT NULL, room_id uuid, chair_id uuid,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, token_hash char(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired','superseded')),
  expires_at timestamptz NOT NULL, responded_at timestamptz, appointment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,waitlist_entry_id,source_appointment_id), UNIQUE(token_hash),
  FOREIGN KEY(tenant_id,organization_id,waitlist_entry_id) REFERENCES waitlist_entries(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,source_appointment_id) REFERENCES appointments(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,doctor_id) REFERENCES doctors(tenant_id,id),
  FOREIGN KEY(tenant_id,room_id) REFERENCES rooms(tenant_id,id),
  FOREIGN KEY(tenant_id,chair_id) REFERENCES chairs(tenant_id,id),
  FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
  CHECK(ends_at>starts_at), CHECK(expires_at<=starts_at),
  CHECK((status='accepted')=(appointment_id IS NOT NULL)),
  CHECK((status='pending' AND responded_at IS NULL) OR (status<>'pending' AND responded_at IS NOT NULL))
);
CREATE UNIQUE INDEX waitlist_offers_one_accepted_slot ON waitlist_offers(tenant_id,source_appointment_id) WHERE status='accepted';

CREATE INDEX recalls_due_idx ON recalls(tenant_id,organization_id,due_on) WHERE status IN ('scheduled','due');
CREATE INDEX waitlist_entries_match_idx ON waitlist_entries(tenant_id,organization_id,date_from,date_to,priority DESC)
  WHERE status='active';
CREATE INDEX waitlist_offers_pending_idx ON waitlist_offers(tenant_id,expires_at) WHERE status='pending';

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['recall_types','recalls','recall_attempts','waitlist_entries','waitlist_preferences','waitlist_offers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',table_name);
  END LOOP;
END $$;

INSERT INTO permissions(key,description) VALUES
  ('recalls.read','Read recall rules and due recalls'),('recalls.manage','Manage recall rules and outreach'),
  ('waitlist.read','Read waitlist entries and slot offers'),('waitlist.manage','Manage waitlist entries and offers')
ON CONFLICT(key) DO NOTHING;

GRANT SELECT,INSERT,UPDATE ON recall_types,recalls,waitlist_entries,waitlist_offers TO dental_app;
GRANT SELECT,INSERT ON recall_attempts,waitlist_preferences TO dental_app;
