CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL, code varchar(32) NOT NULL, name varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), archived_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, branch_id, code),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);

CREATE TABLE chairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL, room_id uuid, code varchar(32) NOT NULL, name varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), archived_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, branch_id, code),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES rooms(tenant_id, id)
);

CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid REFERENCES users(id), first_name varchar(80) NOT NULL, last_name varchar(80) NOT NULL,
  middle_name varchar(80), phone varchar(32), email varchar(320), status varchar(24) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','archived')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, user_id)
);

CREATE TABLE employee_branches (
  tenant_id uuid NOT NULL REFERENCES tenants(id), employee_id uuid NOT NULL, branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, employee_id, branch_id),
  FOREIGN KEY (tenant_id, employee_id) REFERENCES employees(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);

CREATE TABLE doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_id uuid NOT NULL, specialty varchar(120), calendar_color varchar(7) NOT NULL DEFAULT '#0d766f',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, employee_id),
  FOREIGN KEY (tenant_id, employee_id) REFERENCES employees(tenant_id, id)
);

CREATE TABLE service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  parent_id uuid, code varchar(32) NOT NULL, name varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), archived_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES service_categories(tenant_id, id)
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  category_id uuid, code varchar(32) NOT NULL, name varchar(180) NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 720), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, category_id) REFERENCES service_categories(tenant_id, id)
);

CREATE TABLE price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid, name varchar(160) NOT NULL, currency char(3) NOT NULL DEFAULT 'KZT',
  valid_from date NOT NULL, valid_to date, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (tenant_id, id), CHECK (valid_to IS NULL OR valid_to >= valid_from),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);

CREATE TABLE price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  price_list_id uuid NOT NULL, service_id uuid NOT NULL, price_minor bigint NOT NULL CHECK (price_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, price_list_id, service_id),
  FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_lists(tenant_id, id),
  FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
);

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  first_name varchar(80) NOT NULL, last_name varchar(80) NOT NULL, middle_name varchar(80),
  birth_date date, sex varchar(16) NOT NULL DEFAULT 'unknown' CHECK (sex IN ('female','male','unknown')),
  phone varchar(32) NOT NULL, phone_normalized varchar(32) NOT NULL, email varchar(320), notes text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), archived_at timestamptz,
  UNIQUE (tenant_id, id)
);

CREATE TABLE schedule_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL, doctor_id uuid NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), CHECK (ends_at > starts_at), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors(tenant_id, id),
  EXCLUDE USING gist (tenant_id WITH =, doctor_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
);

CREATE TABLE schedule_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  shift_id uuid NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, reason varchar(255),
  CHECK (ends_at > starts_at), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, shift_id) REFERENCES schedule_shifts(tenant_id, id)
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL, doctor_id uuid NOT NULL, branch_id uuid NOT NULL, room_id uuid, chair_id uuid,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'created' CHECK (status IN
    ('created','awaiting_confirmation','confirmed','checked_in','in_progress','completed','cancelled','no_show','rescheduled')),
  source varchar(24) NOT NULL DEFAULT 'internal', reason varchar(500), notes text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (ends_at > starts_at), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id),
  FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES rooms(tenant_id, id),
  FOREIGN KEY (tenant_id, chair_id) REFERENCES chairs(tenant_id, id),
  EXCLUDE USING gist (tenant_id WITH =, doctor_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status NOT IN ('cancelled','no_show','rescheduled')),
  EXCLUDE USING gist (tenant_id WITH =, chair_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (chair_id IS NOT NULL AND status NOT IN ('cancelled','no_show','rescheduled')),
  EXCLUDE USING gist (tenant_id WITH =, room_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (room_id IS NOT NULL AND status NOT IN ('cancelled','no_show','rescheduled'))
);

CREATE TABLE appointment_services (
  tenant_id uuid NOT NULL REFERENCES tenants(id), appointment_id uuid NOT NULL, service_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, appointment_id, service_id),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments(tenant_id, id),
  FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
);

CREATE TABLE appointment_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  appointment_id uuid NOT NULL, body text NOT NULL, author_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments(tenant_id, id)
);

CREATE TABLE appointment_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  appointment_id uuid NOT NULL, from_status varchar(32), to_status varchar(32) NOT NULL,
  reason varchar(500), actor_user_id uuid REFERENCES users(id), occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments(tenant_id, id)
);

CREATE TABLE schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL, doctor_id uuid NOT NULL, name varchar(120) NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7), starts_at time NOT NULL, ends_at time NOT NULL,
  valid_from date NOT NULL, valid_to date, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at), CHECK (valid_to IS NULL OR valid_to >= valid_from),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors(tenant_id, id)
);

CREATE TABLE schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL, doctor_id uuid NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  kind varchar(24) NOT NULL CHECK (kind IN ('available','unavailable')), reason varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(), CHECK (ends_at > starts_at),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors(tenant_id, id)
);

CREATE TABLE resource_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL, room_id uuid, chair_id uuid, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  reason varchar(255) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK (ends_at > starts_at),
  CHECK (room_id IS NOT NULL OR chair_id IS NOT NULL),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES rooms(tenant_id, id),
  FOREIGN KEY (tenant_id, chair_id) REFERENCES chairs(tenant_id, id)
);

CREATE INDEX patients_tenant_name_idx ON patients (tenant_id, last_name, first_name) WHERE archived_at IS NULL;
CREATE INDEX patients_tenant_phone_idx ON patients (tenant_id, phone_normalized) WHERE archived_at IS NULL;
CREATE INDEX appointments_calendar_idx ON appointments (tenant_id, branch_id, starts_at, ends_at);
CREATE INDEX employees_tenant_name_idx ON employees (tenant_id, last_name, first_name);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['rooms','chairs','employees','employee_branches','doctors','service_categories',
    'services','price_lists','price_list_items','patients','schedule_shifts','schedule_breaks','appointments',
    'appointment_services','appointment_notes','appointment_status_events','schedule_templates','schedule_exceptions',
    'resource_reservations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;

INSERT INTO permissions (key, description) VALUES
  ('employees.read','Read employees and doctors'), ('employees.manage','Manage employees and doctors'),
  ('catalog.read','Read services and price lists'), ('catalog.manage','Manage services and price lists'),
  ('patients.read','Read patient records'), ('patients.create','Create patients'), ('patients.update','Update patients'),
  ('appointments.read','Read the calendar'), ('appointments.create','Create appointments'),
  ('appointments.update','Update appointment state'), ('appointments.cancel','Cancel appointments')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON rooms, chairs, employees, employee_branches, doctors, service_categories,
  services, price_lists, price_list_items, patients, schedule_shifts, schedule_breaks, appointments,
  appointment_services, appointment_notes, appointment_status_events, schedule_templates, schedule_exceptions,
  resource_reservations TO dental_app;
