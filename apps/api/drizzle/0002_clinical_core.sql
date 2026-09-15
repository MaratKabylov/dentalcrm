CREATE TABLE encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  appointment_id uuid, patient_id uuid NOT NULL, doctor_id uuid NOT NULL, branch_id uuid NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, completed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), UNIQUE (tenant_id, id),
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments(tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);

CREATE TABLE clinical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  encounter_id uuid NOT NULL, patient_id uuid NOT NULL, doctor_id uuid NOT NULL,
  title varchar(180) NOT NULL, content text NOT NULL, status varchar(24) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','signed','amended')), current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  signed_at timestamptz, signed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters(tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors(tenant_id, id)
);

CREATE TABLE clinical_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  clinical_note_id uuid NOT NULL, version_number integer NOT NULL CHECK (version_number > 0),
  title varchar(180) NOT NULL, content text NOT NULL, author_user_id uuid NOT NULL REFERENCES users(id),
  amendment_reason varchar(1000), created_at timestamptz NOT NULL DEFAULT now(), signed_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, clinical_note_id, version_number),
  FOREIGN KEY (tenant_id, clinical_note_id) REFERENCES clinical_notes(tenant_id, id)
);

CREATE TABLE diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  code varchar(32) NOT NULL, name varchar(500) NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, id), UNIQUE (tenant_id, code)
);

CREATE TABLE encounter_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  encounter_id uuid NOT NULL, diagnosis_id uuid NOT NULL, kind varchar(24) NOT NULL
    CHECK (kind IN ('primary','secondary','differential')), tooth_number smallint,
  recorded_by uuid NOT NULL REFERENCES users(id), recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tooth_number IS NULL OR tooth_number BETWEEN 11 AND 85), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters(tenant_id, id),
  FOREIGN KEY (tenant_id, diagnosis_id) REFERENCES diagnoses(tenant_id, id)
);

CREATE TABLE procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  encounter_id uuid NOT NULL, patient_id uuid NOT NULL, doctor_id uuid NOT NULL, service_id uuid NOT NULL,
  tooth_number smallint, quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status varchar(24) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  notes text, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), CHECK (tooth_number IS NULL OR tooth_number BETWEEN 11 AND 85),
  UNIQUE (tenant_id, id), FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters(tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors(tenant_id, id),
  FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
);

CREATE TABLE procedure_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  procedure_id uuid NOT NULL, from_status varchar(24), to_status varchar(24) NOT NULL,
  actor_user_id uuid REFERENCES users(id), occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, procedure_id) REFERENCES procedures(tenant_id, id)
);

CREATE TABLE odontograms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), UNIQUE (tenant_id, id), UNIQUE (tenant_id, patient_id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id)
);

CREATE TABLE odontogram_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), odontogram_id uuid NOT NULL,
  patient_id uuid NOT NULL, tooth_number smallint NOT NULL CHECK (tooth_number BETWEEN 11 AND 85),
  surface varchar(16) NOT NULL CHECK (surface IN ('whole','occlusal','mesial','distal','buccal','lingual','root')),
  condition_code varchar(64) NOT NULL, status varchar(16) NOT NULL CHECK (status IN ('active','resolved')),
  encounter_id uuid, doctor_id uuid NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0), UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, odontogram_id, tooth_number, surface),
  FOREIGN KEY (tenant_id, odontogram_id) REFERENCES odontograms(tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters(tenant_id, id),
  FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors(tenant_id, id)
);

CREATE TABLE odontogram_entry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), odontogram_entry_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0), condition_code varchar(64) NOT NULL,
  status varchar(16) NOT NULL, encounter_id uuid, doctor_id uuid NOT NULL, observed_at timestamptz NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, odontogram_entry_id, version_number),
  FOREIGN KEY (tenant_id, odontogram_entry_id) REFERENCES odontogram_entries(tenant_id, id)
);

CREATE TABLE treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), patient_id uuid NOT NULL,
  title varchar(180) NOT NULL, status varchar(32) NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','presented','partially_accepted','accepted','in_progress','completed','rejected','cancelled')),
  currency char(3) NOT NULL DEFAULT 'KZT', current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id)
);

CREATE TABLE treatment_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), treatment_plan_id uuid NOT NULL,
  service_id uuid NOT NULL, doctor_id uuid, tooth_number smallint, quantity integer NOT NULL CHECK (quantity > 0),
  list_price_minor bigint NOT NULL CHECK (list_price_minor >= 0), discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  final_price_minor bigint NOT NULL CHECK (final_price_minor >= 0), status varchar(24) NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','accepted','rejected','completed','cancelled')), position integer NOT NULL,
  CHECK (tooth_number IS NULL OR tooth_number BETWEEN 11 AND 85), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, treatment_plan_id) REFERENCES treatment_plans(tenant_id, id),
  FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id),
  FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors(tenant_id, id)
);

CREATE TABLE treatment_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), treatment_plan_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0), snapshot jsonb NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, treatment_plan_id, version_number),
  FOREIGN KEY (tenant_id, treatment_plan_id) REFERENCES treatment_plans(tenant_id, id)
);

CREATE TABLE treatment_plan_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), treatment_plan_id uuid NOT NULL,
  version_number integer NOT NULL, presented_by uuid NOT NULL REFERENCES users(id), presented_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, treatment_plan_id) REFERENCES treatment_plans(tenant_id, id)
);

CREATE TABLE treatment_plan_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), treatment_plan_id uuid NOT NULL,
  treatment_plan_item_id uuid NOT NULL, accepted_by varchar(24) NOT NULL, recorded_by uuid NOT NULL REFERENCES users(id),
  accepted_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, treatment_plan_item_id),
  FOREIGN KEY (tenant_id, treatment_plan_id) REFERENCES treatment_plans(tenant_id, id),
  FOREIGN KEY (tenant_id, treatment_plan_item_id) REFERENCES treatment_plan_items(tenant_id, id)
);

CREATE TABLE treatment_plan_item_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  treatment_plan_item_id uuid NOT NULL, procedure_id uuid NOT NULL, executed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, treatment_plan_item_id, procedure_id),
  FOREIGN KEY (tenant_id, treatment_plan_item_id) REFERENCES treatment_plan_items(tenant_id, id),
  FOREIGN KEY (tenant_id, procedure_id) REFERENCES procedures(tenant_id, id)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), patient_id uuid NOT NULL,
  encounter_id uuid, kind varchar(64) NOT NULL, title varchar(255) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed','void')),
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters(tenant_id, id)
);

CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), document_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0), mime_type varchar(127) NOT NULL, storage_key varchar(1024) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0), checksum_sha256 char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, document_id, version_number), UNIQUE (tenant_id, storage_key),
  FOREIGN KEY (tenant_id, document_id) REFERENCES documents(tenant_id, id)
);

CREATE TABLE document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), document_id uuid NOT NULL,
  document_version_id uuid NOT NULL, signer_type varchar(24) NOT NULL CHECK (signer_type IN ('patient','employee','eds')),
  signer_id uuid, signature_reference varchar(2048), signed_at timestamptz NOT NULL DEFAULT now(), signed_by uuid REFERENCES users(id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES documents(tenant_id, id),
  FOREIGN KEY (tenant_id, document_version_id) REFERENCES document_versions(tenant_id, id)
);

CREATE OR REPLACE FUNCTION reject_immutable_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable history rows cannot be changed' USING ERRCODE = '55000'; END $$;
CREATE TRIGGER clinical_note_versions_immutable BEFORE UPDATE OR DELETE ON clinical_note_versions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_change();
CREATE TRIGGER odontogram_entry_versions_immutable BEFORE UPDATE OR DELETE ON odontogram_entry_versions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_change();
CREATE TRIGGER treatment_plan_versions_immutable BEFORE UPDATE OR DELETE ON treatment_plan_versions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_change();
CREATE TRIGGER document_versions_immutable BEFORE UPDATE OR DELETE ON document_versions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_change();

CREATE OR REPLACE FUNCTION protect_signed_clinical_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('signed','amended') AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title)
  THEN RAISE EXCEPTION 'signed clinical note cannot be edited' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clinical_notes_signed_immutable BEFORE UPDATE ON clinical_notes
  FOR EACH ROW EXECUTE FUNCTION protect_signed_clinical_note();

CREATE INDEX encounters_patient_idx ON encounters (tenant_id, patient_id, started_at DESC);
CREATE INDEX clinical_notes_encounter_idx ON clinical_notes (tenant_id, encounter_id);
CREATE INDEX procedures_encounter_idx ON procedures (tenant_id, encounter_id);
CREATE INDEX odontogram_history_idx ON odontogram_entry_versions (tenant_id, odontogram_entry_id, version_number DESC);
CREATE INDEX treatment_plans_patient_idx ON treatment_plans (tenant_id, patient_id, created_at DESC);
CREATE INDEX documents_patient_idx ON documents (tenant_id, patient_id, created_at DESC);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['encounters','clinical_notes','clinical_note_versions','diagnoses','encounter_diagnoses',
    'procedures','procedure_status_events','odontograms','odontogram_entries','odontogram_entry_versions','treatment_plans',
    'treatment_plan_items','treatment_plan_versions','treatment_plan_presentations','treatment_plan_acceptances',
    'treatment_plan_item_executions','documents','document_versions','document_signatures'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;

INSERT INTO permissions (key, description) VALUES
  ('clinical.read','Read clinical records'), ('clinical.write','Create and edit own encounters'),
  ('clinical.sign','Sign clinical records'), ('clinical.amend','Amend signed clinical records'),
  ('treatment_plans.read','Read treatment plans'), ('treatment_plans.manage','Manage treatment plans'),
  ('documents.read','Read patient documents'), ('documents.manage','Manage patient documents'),
  ('documents.sign','Sign patient documents') ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON encounters, clinical_notes, clinical_note_versions, diagnoses, encounter_diagnoses,
  procedures, procedure_status_events, odontograms, odontogram_entries, odontogram_entry_versions, treatment_plans,
  treatment_plan_items, treatment_plan_versions, treatment_plan_presentations, treatment_plan_acceptances,
  treatment_plan_item_executions, documents, document_versions, document_signatures TO dental_app;
