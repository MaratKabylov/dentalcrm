-- Phase 7: versioned compensation rules, time tracking, payroll accruals, and approval snapshots.

CREATE TABLE compensation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  name varchar(160) NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  archived_at timestamptz, UNIQUE(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE compensation_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  rule_id uuid NOT NULL, version_number integer NOT NULL CHECK(version_number>0),
  calculation_type varchar(24) NOT NULL CHECK(calculation_type IN ('percentage','fixed','hourly','salary','formula')),
  calculation_basis varchar(32) NOT NULL CHECK(calculation_basis IN
    ('gross_service_amount','net_after_discount','net_after_acquiring','net_after_materials','net_after_laboratory','custom')),
  rate numeric(12,6), amount_minor bigint, formula jsonb, currency char(3) NOT NULL DEFAULT 'KZT',
  valid_from date NOT NULL, valid_to date, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,rule_id,version_number),
  FOREIGN KEY(tenant_id,organization_id,rule_id) REFERENCES compensation_rules(tenant_id,organization_id,id),
  CHECK(valid_to IS NULL OR valid_to>=valid_from),
  CHECK((calculation_type='percentage' AND rate>0 AND rate<=100 AND amount_minor IS NULL) OR
        (calculation_type IN ('fixed','hourly','salary') AND amount_minor>=0 AND rate IS NULL) OR
        (calculation_type='formula' AND formula IS NOT NULL AND rate IS NULL AND amount_minor IS NULL))
);

CREATE TABLE compensation_rule_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  rule_version_id uuid NOT NULL, employee_id uuid, branch_id uuid, service_id uuid, service_category_id uuid,
  payment_method varchar(24), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,rule_version_id),
  FOREIGN KEY(tenant_id,organization_id,rule_version_id) REFERENCES compensation_rule_versions(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,service_id) REFERENCES services(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,service_category_id) REFERENCES service_categories(tenant_id,organization_id,id),
  CHECK(payment_method IS NULL OR payment_method IN ('cash','card','bank_transfer','deposit','insurance','other'))
);

CREATE TABLE payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  starts_on date NOT NULL, ends_on date NOT NULL, currency char(3) NOT NULL DEFAULT 'KZT',
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','calculated','approved')),
  calculated_at timestamptz, calculated_by uuid REFERENCES users(id), approved_at timestamptz, approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,starts_on,ends_on,currency),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id), CHECK(ends_on>=starts_on),
  CHECK((status='approved')=(approved_at IS NOT NULL AND approved_by IS NOT NULL)),
  CHECK(status='draft' OR (calculated_at IS NOT NULL AND calculated_by IS NOT NULL))
);

CREATE TABLE timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  employee_id uuid NOT NULL, starts_on date NOT NULL, ends_on date NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),
  submitted_at timestamptz, approved_at timestamptz, approved_by uuid REFERENCES users(id), rejection_reason varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,employee_id,starts_on,ends_on),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id), CHECK(ends_on>=starts_on),
  CHECK(status<>'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL))
);

CREATE TABLE time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  timesheet_id uuid NOT NULL, branch_id uuid NOT NULL, worked_on date NOT NULL, minutes integer NOT NULL CHECK(minutes>0 AND minutes<=1440),
  notes varchar(1000), created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,organization_id,timesheet_id) REFERENCES timesheets(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id)
);

CREATE TABLE payroll_accruals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL, employee_id uuid NOT NULL, rule_version_id uuid NOT NULL,
  source_type varchar(24) NOT NULL CHECK(source_type IN ('procedure','time_entry','salary')),
  source_id uuid, source_amount_minor bigint, quantity numeric(14,6) NOT NULL DEFAULT 1 CHECK(quantity>=0),
  amount_minor bigint NOT NULL, currency char(3) NOT NULL, rule_snapshot jsonb NOT NULL,
  accrued_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,id), UNIQUE NULLS NOT DISTINCT (tenant_id,payroll_period_id,rule_version_id,source_type,source_id),
  FOREIGN KEY(tenant_id,organization_id,payroll_period_id) REFERENCES payroll_periods(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,rule_version_id) REFERENCES compensation_rule_versions(tenant_id,organization_id,id)
);

CREATE TABLE payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL, employee_id uuid NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor<>0),
  currency char(3) NOT NULL, reason varchar(1000) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,organization_id,payroll_period_id) REFERENCES payroll_periods(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id)
);

CREATE TABLE payroll_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL, approved_by uuid NOT NULL REFERENCES users(id), total_amount_minor bigint NOT NULL,
  employee_totals jsonb NOT NULL, note varchar(1000), approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,payroll_period_id),
  FOREIGN KEY(tenant_id,organization_id,payroll_period_id) REFERENCES payroll_periods(tenant_id,organization_id,id)
);

CREATE INDEX compensation_versions_effective_idx ON compensation_rule_versions(tenant_id,organization_id,valid_from,valid_to);
CREATE INDEX payroll_accruals_employee_idx ON payroll_accruals(tenant_id,payroll_period_id,employee_id);
CREATE INDEX time_entries_worked_idx ON time_entries(tenant_id,organization_id,worked_on);

CREATE FUNCTION protect_approved_payroll() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE period_status varchar(16); period_id uuid;
BEGIN
  period_id:=CASE WHEN TG_TABLE_NAME='payroll_periods' THEN OLD.id ELSE OLD.payroll_period_id END;
  SELECT status INTO period_status FROM payroll_periods WHERE id=period_id;
  IF period_status='approved' THEN RAISE EXCEPTION 'approved payroll is immutable' USING ERRCODE='55000'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payroll_accruals_approved_immutable BEFORE UPDATE OR DELETE ON payroll_accruals
  FOR EACH ROW EXECUTE FUNCTION protect_approved_payroll();
CREATE TRIGGER payroll_adjustments_approved_immutable BEFORE UPDATE OR DELETE ON payroll_adjustments
  FOR EACH ROW EXECUTE FUNCTION protect_approved_payroll();
CREATE TRIGGER payroll_periods_approved_immutable BEFORE UPDATE OR DELETE ON payroll_periods
  FOR EACH ROW WHEN (OLD.status='approved') EXECUTE FUNCTION protect_approved_payroll();

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['compensation_rules','compensation_rule_versions','compensation_rule_conditions','payroll_periods',
    'timesheets','time_entries','payroll_accruals','payroll_adjustments','payroll_approvals'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',table_name);
  END LOOP;
END $$;

INSERT INTO permissions(key,description) VALUES
  ('compensation.read_own','Read own approved payroll'),('compensation.read_all','Read payroll for all employees'),
  ('compensation.calculate','Manage rules, timesheets, adjustments, and calculations'),('compensation.approve','Approve payroll and timesheets')
ON CONFLICT(key) DO NOTHING;

GRANT SELECT,INSERT,UPDATE ON compensation_rules,payroll_periods,timesheets,time_entries,payroll_adjustments TO dental_app;
GRANT SELECT,INSERT ON compensation_rule_versions,compensation_rule_conditions,payroll_accruals,payroll_approvals TO dental_app;
GRANT DELETE ON payroll_accruals,time_entries TO dental_app;
