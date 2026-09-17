-- Phase 8: provider-neutral notifications, patient portal, public booking, intake/OCR, family access, and reviews.

CREATE TABLE message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  code varchar(32) NOT NULL, name varchar(160) NOT NULL, channel varchar(16) NOT NULL
    CHECK(channel IN ('whatsapp','sms','email','push','in_app')),
  active boolean NOT NULL DEFAULT true, current_version integer NOT NULL DEFAULT 1 CHECK(current_version>0),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,code,channel),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE message_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  template_id uuid NOT NULL, version_number integer NOT NULL CHECK(version_number>0), locale varchar(16) NOT NULL,
  subject varchar(255), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,template_id,version_number),
  FOREIGN KEY(tenant_id,organization_id,template_id) REFERENCES message_templates(tenant_id,organization_id,id)
);

CREATE TABLE notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  patient_id uuid, template_version_id uuid NOT NULL, channel varchar(16) NOT NULL
    CHECK(channel IN ('whatsapp','sms','email','push','in_app')),
  recipient varchar(320) NOT NULL, variables jsonb NOT NULL DEFAULT '{}', rendered_subject varchar(255), rendered_body text NOT NULL,
  correlation_id varchar(128) NOT NULL, idempotency_key varchar(128) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed','dead_letter','cancelled')),
  scheduled_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,idempotency_key),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,template_version_id) REFERENCES message_template_versions(tenant_id,id)
);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  job_id uuid NOT NULL, provider varchar(64) NOT NULL, provider_message_id varchar(255), status varchar(24) NOT NULL
    CHECK(status IN ('accepted','sent','delivered','failed','unknown')),
  safe_response jsonb, occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,job_id) REFERENCES notification_jobs(tenant_id,organization_id,id)
);

CREATE TABLE communication_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  patient_id uuid NOT NULL, channel varchar(16) NOT NULL CHECK(channel IN ('whatsapp','sms','email','push','in_app')),
  allowed boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,organization_id,patient_id,channel),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id)
);

CREATE TABLE portal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  contact_type varchar(16) NOT NULL CHECK(contact_type IN ('email','phone')), contact varchar(320) NOT NULL,
  contact_normalized varchar(320) NOT NULL, status varchar(16) NOT NULL DEFAULT 'invited'
    CHECK(status IN ('invited','active','suspended')),
  invitation_token_hash char(64), invitation_expires_at timestamptz, invitation_consumed_at timestamptz,
  activated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,contact_type,contact_normalized),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  CHECK((invitation_token_hash IS NULL)=(invitation_expires_at IS NULL))
);

CREATE TABLE portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  account_id uuid NOT NULL, token_hash char(64) NOT NULL, expires_at timestamptz NOT NULL,
  last_used_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,token_hash),
  FOREIGN KEY(tenant_id,organization_id,account_id) REFERENCES portal_accounts(tenant_id,organization_id,id)
);

CREATE TABLE portal_patient_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  account_id uuid NOT NULL, patient_id uuid NOT NULL, relationship varchar(24) NOT NULL
    CHECK(relationship IN ('self','parent','guardian','representative')),
  access_level varchar(16) NOT NULL DEFAULT 'full' CHECK(access_level IN ('read_only','full')),
  verified_at timestamptz NOT NULL, verified_by uuid NOT NULL REFERENCES users(id), evidence_reference varchar(1000) NOT NULL,
  revoked_at timestamptz, revoked_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,organization_id,account_id,patient_id),
  FOREIGN KEY(tenant_id,organization_id,account_id) REFERENCES portal_accounts(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id)
);

CREATE TABLE legal_representative_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  representative_patient_id uuid, represented_patient_id uuid NOT NULL, portal_account_id uuid NOT NULL,
  relationship varchar(24) NOT NULL CHECK(relationship IN ('parent','guardian','representative')),
  evidence_reference varchar(1000) NOT NULL, verified_at timestamptz NOT NULL, verified_by uuid NOT NULL REFERENCES users(id),
  valid_until date, revoked_at timestamptz, revoked_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,organization_id,portal_account_id,represented_patient_id),
  FOREIGN KEY(tenant_id,representative_patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,represented_patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,portal_account_id) REFERENCES portal_accounts(tenant_id,organization_id,id)
);

CREATE TABLE booking_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  branch_id uuid NOT NULL, doctor_id uuid NOT NULL, service_id uuid NOT NULL, chair_id uuid,
  slot_interval_minutes integer NOT NULL DEFAULT 15 CHECK(slot_interval_minutes BETWEEN 5 AND 240),
  minimum_notice_minutes integer NOT NULL DEFAULT 120 CHECK(minimum_notice_minutes BETWEEN 0 AND 525600),
  booking_horizon_days integer NOT NULL DEFAULT 90 CHECK(booking_horizon_days BETWEEN 1 AND 365), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,doctor_id) REFERENCES doctors(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,service_id) REFERENCES services(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,chair_id) REFERENCES chairs(tenant_id,id)
);

CREATE TABLE public_booking_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  booking_rule_id uuid NOT NULL, branch_id uuid NOT NULL, doctor_id uuid NOT NULL, service_id uuid NOT NULL, chair_id uuid,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, status varchar(16) NOT NULL DEFAULT 'published'
    CHECK(status IN ('published','booked','withdrawn','expired')),
  appointment_id uuid, published_at timestamptz NOT NULL DEFAULT now(), booked_at timestamptz,
  UNIQUE(tenant_id,id), CHECK(ends_at>starts_at),
  FOREIGN KEY(tenant_id,organization_id,booking_rule_id) REFERENCES booking_rules(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
  CHECK((status='booked')=(appointment_id IS NOT NULL AND booked_at IS NOT NULL)),
  EXCLUDE USING gist (tenant_id WITH =,doctor_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status='published'),
  EXCLUDE USING gist (tenant_id WITH =,chair_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
    WHERE(status='published' AND chair_id IS NOT NULL)
);

CREATE TABLE booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  slot_id uuid NOT NULL, patient_id uuid NOT NULL, appointment_id uuid NOT NULL, idempotency_key varchar(128) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
  contact_snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,organization_id,idempotency_key), UNIQUE(tenant_id,slot_id),
  FOREIGN KEY(tenant_id,slot_id) REFERENCES public_booking_slots(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id)
);

CREATE TABLE intake_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  code varchar(32) NOT NULL, name varchar(160) NOT NULL, active boolean NOT NULL DEFAULT true,
  current_version integer NOT NULL DEFAULT 1 CHECK(current_version>0), created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE intake_form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  form_id uuid NOT NULL, version_number integer NOT NULL CHECK(version_number>0), fields jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,form_id,version_number),
  FOREIGN KEY(tenant_id,organization_id,form_id) REFERENCES intake_forms(tenant_id,organization_id,id)
);

CREATE TABLE intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  form_version_id uuid NOT NULL, patient_id uuid NOT NULL, access_token_hash char(64) NOT NULL, expires_at timestamptz NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','submitted','ocr_ready','patient_confirmed','reviewed','rejected')),
  answers jsonb, uploads jsonb NOT NULL DEFAULT '[]', submitted_at timestamptz,
  confirmed_data jsonb, confirmed_at timestamptz, reviewed_at timestamptz, reviewed_by uuid REFERENCES users(id), review_note varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,access_token_hash),
  FOREIGN KEY(tenant_id,form_version_id) REFERENCES intake_form_versions(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  CHECK((confirmed_data IS NULL)=(confirmed_at IS NULL)),
  CHECK((reviewed_at IS NULL)=(reviewed_by IS NULL))
);

CREATE TABLE ocr_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  submission_id uuid NOT NULL, status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','succeeded','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), last_error text, created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz, UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,submission_id),
  FOREIGN KEY(tenant_id,organization_id,submission_id) REFERENCES intake_submissions(tenant_id,organization_id,id)
);

CREATE TABLE ocr_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  ocr_job_id uuid NOT NULL, provider varchar(64) NOT NULL, extracted_data jsonb NOT NULL,
  confidence numeric(5,4), raw_reference varchar(1024), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,ocr_job_id),
  FOREIGN KEY(tenant_id,organization_id,ocr_job_id) REFERENCES ocr_jobs(tenant_id,organization_id,id),
  CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1)
);

CREATE TABLE review_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  name varchar(120) NOT NULL, url text NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL, patient_id uuid NOT NULL, destination_id uuid, token_hash char(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','expired','cancelled')),
  expires_at timestamptz NOT NULL, submitted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,token_hash), UNIQUE(tenant_id,appointment_id),
  FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,destination_id) REFERENCES review_destinations(tenant_id,organization_id,id)
);

CREATE TABLE review_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  review_request_id uuid NOT NULL, rating smallint NOT NULL CHECK(rating BETWEEN 1 AND 5), comment text,
  public_review_suggested boolean NOT NULL DEFAULT false, service_recovery_task_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,review_request_id),
  FOREIGN KEY(tenant_id,organization_id,review_request_id) REFERENCES review_requests(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,service_recovery_task_id) REFERENCES tasks(tenant_id,organization_id,id)
);

CREATE INDEX notification_jobs_due_idx ON notification_jobs(tenant_id,status,scheduled_at) WHERE status IN ('pending','failed');
CREATE INDEX portal_sessions_token_idx ON portal_sessions(tenant_id,token_hash) WHERE revoked_at IS NULL;
CREATE INDEX public_booking_slots_search_idx ON public_booking_slots(tenant_id,organization_id,starts_at) WHERE status='published';
CREATE INDEX intake_submissions_patient_idx ON intake_submissions(tenant_id,patient_id,created_at DESC);
CREATE INDEX review_requests_pending_idx ON review_requests(tenant_id,organization_id,expires_at) WHERE status='pending';

CREATE TRIGGER message_template_versions_immutable BEFORE UPDATE OR DELETE ON message_template_versions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_change();
CREATE TRIGGER ocr_results_immutable BEFORE UPDATE OR DELETE ON ocr_results
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_change();

CREATE FUNCTION protect_confirmed_ocr_data() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.confirmed_at IS NOT NULL AND (NEW.confirmed_data IS DISTINCT FROM OLD.confirmed_data OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
  THEN RAISE EXCEPTION 'confirmed OCR data is immutable' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER intake_confirmed_ocr_immutable BEFORE UPDATE ON intake_submissions
  FOR EACH ROW EXECUTE FUNCTION protect_confirmed_ocr_data();

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['message_templates','message_template_versions','notification_jobs','notification_deliveries',
    'communication_preferences','portal_accounts','portal_sessions','portal_patient_links','legal_representative_links','booking_rules',
    'public_booking_slots','booking_requests','intake_forms','intake_form_versions','intake_submissions','ocr_jobs','ocr_results',
    'review_destinations','review_requests','review_feedback'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',table_name);
  END LOOP;
END $$;

INSERT INTO permissions(key,description) VALUES
  ('communications.read','Read message templates and notification delivery state'),
  ('communications.manage','Manage templates and queue provider-neutral notifications'),
  ('portal.manage','Create verified portal and family access'),
  ('booking.manage','Manage public booking rules and slots'),
  ('intake.read','Read intake and OCR results'),('intake.manage','Manage forms, OCR, and intake review'),
  ('reviews.read','Read patient feedback'),('reviews.manage','Manage review destinations and requests')
ON CONFLICT(key) DO NOTHING;

GRANT SELECT,INSERT,UPDATE ON message_templates,notification_jobs,communication_preferences,portal_accounts,portal_sessions,
  portal_patient_links,legal_representative_links,booking_rules,public_booking_slots,booking_requests,intake_forms,intake_submissions,
  ocr_jobs,review_destinations,review_requests TO dental_app;
GRANT SELECT,INSERT ON message_template_versions,notification_deliveries,intake_form_versions,ocr_results,review_feedback TO dental_app;
