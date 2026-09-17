-- Phase 9: laboratory cases, insurance claims, append-only loyalty, coupons, and promotions.

CREATE TABLE laboratories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  code varchar(32) NOT NULL,name varchar(180) NOT NULL,phone varchar(32),email varchar(320),address varchar(500),active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),archived_at timestamptz,UNIQUE(tenant_id,organization_id,id),UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE lab_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  laboratory_id uuid NOT NULL,patient_id uuid NOT NULL,encounter_id uuid,responsible_doctor_id uuid NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'ordered' CHECK(status IN
    ('ordered','impression_taken','sent','in_production','received','fitted','completed','rework','cancelled')),
  expected_at timestamptz,sent_at timestamptz,received_at timestamptz,completed_at timestamptz,notes text,
  created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),version integer NOT NULL DEFAULT 1 CHECK(version>0),UNIQUE(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,laboratory_id) REFERENCES laboratories(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),FOREIGN KEY(tenant_id,encounter_id) REFERENCES encounters(tenant_id,id),
  FOREIGN KEY(tenant_id,responsible_doctor_id) REFERENCES doctors(tenant_id,id)
);

CREATE TABLE lab_case_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  lab_case_id uuid NOT NULL,procedure_id uuid,treatment_plan_item_id uuid,description varchar(500) NOT NULL,tooth_number smallint,
  shade varchar(64),cost_minor bigint NOT NULL CHECK(cost_minor>=0),currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,lab_case_id) REFERENCES lab_cases(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,procedure_id) REFERENCES procedures(tenant_id,id),
  FOREIGN KEY(tenant_id,treatment_plan_item_id) REFERENCES treatment_plan_items(tenant_id,id),
  CHECK(procedure_id IS NOT NULL OR treatment_plan_item_id IS NOT NULL),CHECK(tooth_number IS NULL OR tooth_number BETWEEN 11 AND 85)
);

CREATE TABLE lab_case_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  lab_case_id uuid NOT NULL,from_status varchar(24),to_status varchar(24) NOT NULL,reason varchar(1000),actor_user_id uuid REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,lab_case_id) REFERENCES lab_cases(tenant_id,organization_id,id)
);

CREATE TABLE lab_case_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  lab_case_id uuid NOT NULL,kind varchar(64) NOT NULL,storage_key varchar(1024) NOT NULL,mime_type varchar(127) NOT NULL,
  size_bytes bigint NOT NULL CHECK(size_bytes>=0),checksum_sha256 char(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),UNIQUE(tenant_id,id),UNIQUE(tenant_id,storage_key),
  FOREIGN KEY(tenant_id,organization_id,lab_case_id) REFERENCES lab_cases(tenant_id,organization_id,id)
);

CREATE TABLE lab_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  lab_case_id uuid NOT NULL,laboratory_id uuid NOT NULL,invoice_number varchar(120) NOT NULL,total_cost_minor bigint NOT NULL CHECK(total_cost_minor>=0),
  currency char(3) NOT NULL,issued_on date NOT NULL,due_on date,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,id),UNIQUE(tenant_id,laboratory_id,invoice_number),
  FOREIGN KEY(tenant_id,organization_id,lab_case_id) REFERENCES lab_cases(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,laboratory_id) REFERENCES laboratories(tenant_id,organization_id,id),
  CHECK(due_on IS NULL OR due_on>=issued_on)
);

CREATE FUNCTION enforce_lab_case_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF NOT ((OLD.status='ordered' AND NEW.status IN ('impression_taken','sent','cancelled')) OR
    (OLD.status='impression_taken' AND NEW.status IN ('sent','cancelled')) OR
    (OLD.status='sent' AND NEW.status IN ('in_production','received','cancelled')) OR
    (OLD.status='in_production' AND NEW.status IN ('received','rework','cancelled')) OR
    (OLD.status='received' AND NEW.status IN ('fitted','completed','rework','cancelled')) OR
    (OLD.status='fitted' AND NEW.status IN ('completed','rework','cancelled')) OR
    (OLD.status='completed' AND NEW.status='rework') OR
    (OLD.status='rework' AND NEW.status IN ('sent','in_production','cancelled'))) THEN
    RAISE EXCEPTION 'invalid lab case transition from % to %',OLD.status,NEW.status USING ERRCODE='23514';
  END IF;RETURN NEW;
END $$;
CREATE TRIGGER lab_case_transition_guard BEFORE UPDATE OF status ON lab_cases FOR EACH ROW EXECUTE FUNCTION enforce_lab_case_transition();

CREATE TABLE insurance_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  code varchar(32) NOT NULL,name varchar(180) NOT NULL,contact varchar(500),active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),UNIQUE(tenant_id,organization_id,id),UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE insurance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  company_id uuid NOT NULL,code varchar(32) NOT NULL,name varchar(180) NOT NULL,currency char(3) NOT NULL,active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),UNIQUE(tenant_id,organization_id,id),
  UNIQUE(tenant_id,company_id,code),FOREIGN KEY(tenant_id,organization_id,company_id) REFERENCES insurance_companies(tenant_id,organization_id,id)
);

CREATE TABLE insurance_price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  plan_id uuid NOT NULL,name varchar(180) NOT NULL,currency char(3) NOT NULL,valid_from date NOT NULL,valid_to date,active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),UNIQUE(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,plan_id) REFERENCES insurance_plans(tenant_id,organization_id,id),CHECK(valid_to IS NULL OR valid_to>=valid_from)
);

CREATE TABLE insurance_price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  price_list_id uuid NOT NULL,service_id uuid NOT NULL,price_minor bigint NOT NULL CHECK(price_minor>=0),created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),UNIQUE(tenant_id,price_list_id,service_id),
  FOREIGN KEY(tenant_id,organization_id,price_list_id) REFERENCES insurance_price_lists(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,service_id) REFERENCES services(tenant_id,organization_id,id)
);

CREATE TABLE patient_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  plan_id uuid NOT NULL,patient_id uuid NOT NULL,policy_number varchar(120) NOT NULL,valid_from date NOT NULL,valid_to date,
  coverage_percent numeric(5,2) NOT NULL DEFAULT 100 CHECK(coverage_percent BETWEEN 0 AND 100),status varchar(16) NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','suspended','expired','cancelled')),created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id),UNIQUE(tenant_id,plan_id,policy_number),
  FOREIGN KEY(tenant_id,organization_id,plan_id) REFERENCES insurance_plans(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),CHECK(valid_to IS NULL OR valid_to>=valid_from)
);

CREATE TABLE insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  policy_id uuid NOT NULL,patient_id uuid NOT NULL,branch_id uuid NOT NULL,service_date date NOT NULL,currency char(3) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','partially_approved','rejected','paid','cancelled')),
  billed_amount_minor bigint NOT NULL DEFAULT 0 CHECK(billed_amount_minor>=0),approved_amount_minor bigint CHECK(approved_amount_minor>=0),
  submitted_at timestamptz,adjudicated_at timestamptz,paid_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id),FOREIGN KEY(tenant_id,organization_id,policy_id) REFERENCES patient_policies(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id)
);

CREATE TABLE insurance_claim_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  claim_id uuid NOT NULL,procedure_id uuid NOT NULL,service_id uuid NOT NULL,billed_amount_minor bigint NOT NULL CHECK(billed_amount_minor>0),
  approved_amount_minor bigint CHECK(approved_amount_minor>=0),adjudication_reason varchar(1000),created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),UNIQUE(tenant_id,claim_id,procedure_id),
  FOREIGN KEY(tenant_id,organization_id,claim_id) REFERENCES insurance_claims(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,procedure_id) REFERENCES procedures(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,service_id) REFERENCES services(tenant_id,organization_id,id),
  CHECK(approved_amount_minor IS NULL OR approved_amount_minor<=billed_amount_minor)
);

CREATE TABLE insurance_claim_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  claim_id uuid NOT NULL,from_status varchar(24),to_status varchar(24) NOT NULL,details jsonb,actor_user_id uuid REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,claim_id) REFERENCES insurance_claims(tenant_id,organization_id,id)
);

CREATE TABLE insurance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  claim_id uuid NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>0),currency char(3) NOT NULL,reference varchar(255) NOT NULL,
  idempotency_key varchar(128) NOT NULL,paid_at timestamptz NOT NULL DEFAULT now(),recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),UNIQUE(tenant_id,organization_id,idempotency_key),
  FOREIGN KEY(tenant_id,organization_id,claim_id) REFERENCES insurance_claims(tenant_id,organization_id,id)
);

CREATE FUNCTION enforce_insurance_claim_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE paid_total bigint;
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW;END IF;
  IF NOT ((OLD.status='draft' AND NEW.status IN ('submitted','cancelled')) OR
    (OLD.status='submitted' AND NEW.status IN ('approved','partially_approved','rejected','cancelled')) OR
    (OLD.status IN ('approved','partially_approved') AND NEW.status='paid')) THEN
    RAISE EXCEPTION 'invalid insurance claim transition from % to %',OLD.status,NEW.status USING ERRCODE='23514';END IF;
  IF NEW.status='paid' THEN SELECT COALESCE(sum(amount_minor),0) INTO paid_total FROM insurance_payments WHERE claim_id=OLD.id;
    IF paid_total<>NEW.approved_amount_minor THEN RAISE EXCEPTION 'insurance claim payment does not equal approved amount' USING ERRCODE='23514';END IF;
  END IF;RETURN NEW;
END $$;
CREATE TRIGGER insurance_claim_transition_guard BEFORE UPDATE OF status ON insurance_claims FOR EACH ROW EXECUTE FUNCTION enforce_insurance_claim_transition();

CREATE FUNCTION enforce_insurance_payment_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE approved bigint;paid bigint;claim_status varchar(24);
BEGIN
  PERFORM 1 FROM insurance_claims WHERE id=NEW.claim_id FOR UPDATE;
  SELECT approved_amount_minor,status INTO approved,claim_status FROM insurance_claims WHERE id=NEW.claim_id;
  IF claim_status NOT IN ('approved','partially_approved') THEN RAISE EXCEPTION 'insurance claim is not payable' USING ERRCODE='23514';END IF;
  SELECT COALESCE(sum(amount_minor),0) INTO paid FROM insurance_payments WHERE claim_id=NEW.claim_id;
  IF paid+NEW.amount_minor>approved THEN RAISE EXCEPTION 'insurance payment exceeds approved amount' USING ERRCODE='23514';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER insurance_payment_limit BEFORE INSERT ON insurance_payments FOR EACH ROW EXECUTE FUNCTION enforce_insurance_payment_limit();

CREATE TABLE loyalty_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  code varchar(32) NOT NULL,name varchar(180) NOT NULL,currency char(3) NOT NULL,active boolean NOT NULL DEFAULT true,
  current_rule_version integer NOT NULL DEFAULT 1 CHECK(current_rule_version>0),created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id),UNIQUE(tenant_id,organization_id,code),FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE loyalty_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  program_id uuid NOT NULL,version_number integer NOT NULL CHECK(version_number>0),earning_rate_bps integer NOT NULL CHECK(earning_rate_bps BETWEEN 0 AND 10000),
  max_redemption_bps integer NOT NULL CHECK(max_redemption_bps BETWEEN 0 AND 10000),valid_from date NOT NULL,valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),UNIQUE(tenant_id,id),UNIQUE(tenant_id,program_id,version_number),
  FOREIGN KEY(tenant_id,organization_id,program_id) REFERENCES loyalty_programs(tenant_id,organization_id,id),CHECK(valid_to IS NULL OR valid_to>=valid_from)
);

CREATE TABLE bonus_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  program_id uuid NOT NULL,patient_id uuid NOT NULL,status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,organization_id,id),UNIQUE(tenant_id,program_id,patient_id),
  FOREIGN KEY(tenant_id,organization_id,program_id) REFERENCES loyalty_programs(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id)
);

CREATE TABLE bonus_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  bonus_account_id uuid NOT NULL,rule_id uuid,transaction_type varchar(16) NOT NULL CHECK(transaction_type IN ('earn','redeem','adjustment','reversal')),
  points bigint NOT NULL CHECK(points<>0),source_type varchar(48) NOT NULL,source_id uuid,reason varchar(1000),idempotency_key varchar(128) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,bonus_account_id,idempotency_key),
  FOREIGN KEY(tenant_id,organization_id,bonus_account_id) REFERENCES bonus_accounts(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,rule_id) REFERENCES loyalty_rules(tenant_id,id),
  CHECK((transaction_type='earn' AND points>0) OR (transaction_type='redeem' AND points<0) OR transaction_type IN ('adjustment','reversal'))
);

CREATE FUNCTION enforce_nonnegative_bonus_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_balance bigint;
BEGIN
  PERFORM 1 FROM bonus_accounts WHERE id=NEW.bonus_account_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bonus account is not active' USING ERRCODE='23514';END IF;
  SELECT COALESCE(sum(points),0) INTO current_balance FROM bonus_transactions WHERE bonus_account_id=NEW.bonus_account_id;
  IF current_balance+NEW.points<0 THEN RAISE EXCEPTION 'insufficient bonus balance' USING ERRCODE='23514';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bonus_balance_guard BEFORE INSERT ON bonus_transactions FOR EACH ROW EXECUTE FUNCTION enforce_nonnegative_bonus_balance();

CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  code varchar(32) NOT NULL,name varchar(180) NOT NULL,discount_type varchar(16) NOT NULL CHECK(discount_type IN ('percentage','fixed')),
  discount_value bigint NOT NULL CHECK(discount_value>0),valid_from timestamptz NOT NULL,valid_to timestamptz NOT NULL,
  usage_limit integer CHECK(usage_limit>0),active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),UNIQUE(tenant_id,organization_id,id),UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),CHECK(valid_to>valid_from),
  CHECK(discount_type<>'percentage' OR discount_value<=10000)
);

CREATE TABLE promotion_services (
  tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,promotion_id uuid NOT NULL,service_id uuid NOT NULL,
  PRIMARY KEY(tenant_id,promotion_id,service_id),FOREIGN KEY(tenant_id,organization_id,promotion_id) REFERENCES promotions(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,service_id) REFERENCES services(tenant_id,organization_id,id)
);

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  promotion_id uuid NOT NULL,code varchar(64) NOT NULL,patient_id uuid,expires_at timestamptz,max_uses integer NOT NULL DEFAULT 1 CHECK(max_uses>0),
  active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id),UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id,promotion_id) REFERENCES promotions(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id)
);

CREATE TABLE promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  promotion_id uuid NOT NULL,coupon_id uuid,patient_id uuid,service_id uuid,gross_amount_minor bigint NOT NULL CHECK(gross_amount_minor>0),
  discount_amount_minor bigint NOT NULL CHECK(discount_amount_minor>=0),reference_type varchar(48) NOT NULL,reference_id uuid NOT NULL,
  idempotency_key varchar(128) NOT NULL,redeemed_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,id),UNIQUE(tenant_id,organization_id,idempotency_key),
  FOREIGN KEY(tenant_id,organization_id,promotion_id) REFERENCES promotions(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,coupon_id) REFERENCES coupons(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,service_id) REFERENCES services(tenant_id,organization_id,id)
);

CREATE FUNCTION enforce_coupon_usage_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed integer;used integer;coupon_active boolean;coupon_expiry timestamptz;
BEGIN
  IF NEW.coupon_id IS NULL THEN RETURN NEW;END IF;PERFORM 1 FROM coupons WHERE id=NEW.coupon_id FOR UPDATE;
  SELECT max_uses,active,expires_at INTO allowed,coupon_active,coupon_expiry FROM coupons WHERE id=NEW.coupon_id;
  SELECT count(*) INTO used FROM promotion_redemptions WHERE coupon_id=NEW.coupon_id;
  IF NOT coupon_active OR (coupon_expiry IS NOT NULL AND coupon_expiry<=now()) OR used>=allowed THEN
    RAISE EXCEPTION 'coupon is unavailable' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER coupon_usage_guard BEFORE INSERT ON promotion_redemptions FOR EACH ROW EXECUTE FUNCTION enforce_coupon_usage_limit();

CREATE INDEX lab_cases_due_idx ON lab_cases(tenant_id,organization_id,status,expected_at);
CREATE INDEX insurance_claims_status_idx ON insurance_claims(tenant_id,organization_id,status,service_date);
CREATE INDEX bonus_transactions_account_idx ON bonus_transactions(tenant_id,bonus_account_id,occurred_at,id);
CREATE INDEX promotions_active_idx ON promotions(tenant_id,organization_id,valid_from,valid_to) WHERE active;

CREATE TRIGGER lab_case_status_events_immutable BEFORE UPDATE OR DELETE ON lab_case_status_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_change();
CREATE TRIGGER lab_invoices_immutable BEFORE UPDATE OR DELETE ON lab_invoices FOR EACH ROW EXECUTE FUNCTION reject_posted_finance_change();
CREATE TRIGGER insurance_claim_events_immutable BEFORE UPDATE OR DELETE ON insurance_claim_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_change();
CREATE TRIGGER insurance_payments_immutable BEFORE UPDATE OR DELETE ON insurance_payments FOR EACH ROW EXECUTE FUNCTION reject_posted_finance_change();
CREATE TRIGGER loyalty_rules_immutable BEFORE UPDATE OR DELETE ON loyalty_rules FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_change();
CREATE TRIGGER bonus_transactions_immutable BEFORE UPDATE OR DELETE ON bonus_transactions FOR EACH ROW EXECUTE FUNCTION reject_posted_finance_change();
CREATE TRIGGER promotion_redemptions_immutable BEFORE UPDATE OR DELETE ON promotion_redemptions FOR EACH ROW EXECUTE FUNCTION reject_posted_finance_change();

DO $$ DECLARE table_name text;BEGIN
  FOREACH table_name IN ARRAY ARRAY['laboratories','lab_cases','lab_case_items','lab_case_status_events','lab_case_files','lab_invoices',
    'insurance_companies','insurance_plans','insurance_price_lists','insurance_price_list_items','patient_policies','insurance_claims',
    'insurance_claim_items','insurance_claim_events','insurance_payments','loyalty_programs','loyalty_rules','bonus_accounts','bonus_transactions',
    'promotions','promotion_services','coupons','promotion_redemptions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',table_name);
  END LOOP;
END $$;

INSERT INTO permissions(key,description) VALUES
  ('laboratory.read','Read laboratories and lab cases'),('laboratory.manage','Manage laboratories, cases, files, invoices, and status'),
  ('insurance.read','Read insurance catalog, policies, and claims'),('insurance.manage','Manage insurance catalog, policies, and claim drafts'),
  ('insurance.adjudicate','Submit and adjudicate claims and record insurance payments'),
  ('loyalty.read','Read loyalty balances and promotions'),('loyalty.manage','Manage loyalty programs, promotions, and coupons'),
  ('loyalty.adjust','Award, redeem, and adjust bonus points') ON CONFLICT(key) DO NOTHING;

GRANT SELECT,INSERT,UPDATE ON laboratories,lab_cases,insurance_companies,insurance_plans,insurance_price_lists,patient_policies,
  insurance_claims,insurance_claim_items,loyalty_programs,bonus_accounts,promotions,coupons TO dental_app;
GRANT SELECT,INSERT ON lab_case_items,lab_case_status_events,lab_case_files,lab_invoices,insurance_price_list_items,insurance_claim_events,
  insurance_payments,loyalty_rules,bonus_transactions,promotion_services,promotion_redemptions TO dental_app;

