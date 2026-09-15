CREATE TABLE financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid, patient_id uuid, code varchar(160) NOT NULL, name varchar(255) NOT NULL,
  account_type varchar(24) NOT NULL CHECK (account_type IN ('asset','liability','revenue','expense','equity')),
  account_subtype varchar(40) NOT NULL, currency char(3) NOT NULL DEFAULT 'KZT', is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), archived_at timestamptz,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,code,currency),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id),
  FOREIGN KEY (tenant_id,patient_id) REFERENCES patients(tenant_id,id)
);

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_type varchar(32) NOT NULL CHECK (transaction_type IN ('charge','payment','refund','expense','adjustment','reversal')),
  currency char(3) NOT NULL, description varchar(500), reverses_transaction_id uuid,
  idempotency_key varchar(128), posted_at timestamptz NOT NULL DEFAULT now(), posted_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,reverses_transaction_id) REFERENCES ledger_transactions(tenant_id,id)
);
CREATE UNIQUE INDEX ledger_transactions_idempotency_idx ON ledger_transactions (tenant_id,transaction_type,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL, account_id uuid NOT NULL, patient_id uuid,
  amount_minor bigint NOT NULL CHECK (amount_minor <> 0), memo varchar(500), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), FOREIGN KEY (tenant_id,transaction_id) REFERENCES ledger_transactions(tenant_id,id),
  FOREIGN KEY (tenant_id,account_id) REFERENCES financial_accounts(tenant_id,id),
  FOREIGN KEY (tenant_id,patient_id) REFERENCES patients(tenant_id,id)
);

CREATE TABLE charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL, branch_id uuid NOT NULL, encounter_id uuid, ledger_transaction_id uuid NOT NULL,
  currency char(3) NOT NULL, total_amount_minor bigint NOT NULL CHECK (total_amount_minor > 0), description varchar(500),
  posted_at timestamptz NOT NULL DEFAULT now(), posted_by uuid NOT NULL REFERENCES users(id), UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,ledger_transaction_id), FOREIGN KEY (tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id),
  FOREIGN KEY (tenant_id,encounter_id) REFERENCES encounters(tenant_id,id),
  FOREIGN KEY (tenant_id,ledger_transaction_id) REFERENCES ledger_transactions(tenant_id,id)
);

CREATE TABLE charge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), charge_id uuid NOT NULL,
  service_id uuid, procedure_id uuid, description varchar(500) NOT NULL, quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor > 0), total_amount_minor bigint NOT NULL CHECK (total_amount_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,charge_id) REFERENCES charges(tenant_id,id),
  FOREIGN KEY (tenant_id,service_id) REFERENCES services(tenant_id,id),
  FOREIGN KEY (tenant_id,procedure_id) REFERENCES procedures(tenant_id,id),
  CHECK (total_amount_minor = unit_price_minor * quantity)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL, branch_id uuid NOT NULL, ledger_transaction_id uuid NOT NULL, currency char(3) NOT NULL,
  total_amount_minor bigint NOT NULL CHECK (total_amount_minor > 0), note varchar(500), idempotency_key varchar(128) NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(), posted_by uuid NOT NULL REFERENCES users(id), UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,idempotency_key), UNIQUE (tenant_id,ledger_transaction_id),
  FOREIGN KEY (tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id),
  FOREIGN KEY (tenant_id,ledger_transaction_id) REFERENCES ledger_transactions(tenant_id,id)
);

CREATE TABLE cashboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), branch_id uuid NOT NULL,
  financial_account_id uuid NOT NULL, code varchar(32) NOT NULL, name varchar(160) NOT NULL, currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), archived_at timestamptz,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,branch_id,code), UNIQUE (tenant_id,financial_account_id),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id),
  FOREIGN KEY (tenant_id,financial_account_id) REFERENCES financial_accounts(tenant_id,id)
);

CREATE TABLE cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), cashbox_id uuid NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening_amount_minor bigint NOT NULL CHECK (opening_amount_minor >= 0), closing_amount_minor bigint CHECK (closing_amount_minor >= 0),
  expected_closing_amount_minor bigint, discrepancy_minor bigint, opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by uuid NOT NULL REFERENCES users(id), closed_at timestamptz, closed_by uuid REFERENCES users(id), close_note varchar(500),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,cashbox_id) REFERENCES cashboxes(tenant_id,id)
);
CREATE UNIQUE INDEX cash_sessions_one_open_idx ON cash_sessions (tenant_id,cashbox_id) WHERE status='open';

CREATE TABLE payment_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), payment_id uuid NOT NULL,
  method varchar(24) NOT NULL CHECK (method IN ('cash','card','bank_transfer','kaspi','deposit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0), account_id uuid NOT NULL, cashbox_id uuid, deposit_id uuid,
  reference varchar(255), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,payment_id) REFERENCES payments(tenant_id,id),
  FOREIGN KEY (tenant_id,account_id) REFERENCES financial_accounts(tenant_id,id),
  FOREIGN KEY (tenant_id,cashbox_id) REFERENCES cashboxes(tenant_id,id),
  CHECK ((method='deposit') = (deposit_id IS NOT NULL)), CHECK ((method='cash') = (cashbox_id IS NOT NULL))
);

CREATE TABLE payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), payment_id uuid NOT NULL,
  charge_id uuid NOT NULL, amount_minor bigint NOT NULL CHECK (amount_minor > 0), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,payment_id,charge_id),
  FOREIGN KEY (tenant_id,payment_id) REFERENCES payments(tenant_id,id),
  FOREIGN KEY (tenant_id,charge_id) REFERENCES charges(tenant_id,id)
);

CREATE TABLE patient_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), patient_id uuid NOT NULL,
  source_payment_id uuid NOT NULL, liability_account_id uuid NOT NULL, currency char(3) NOT NULL,
  original_amount_minor bigint NOT NULL CHECK (original_amount_minor > 0), created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id), UNIQUE (tenant_id,id), UNIQUE (tenant_id,source_payment_id),
  FOREIGN KEY (tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY (tenant_id,source_payment_id) REFERENCES payments(tenant_id,id),
  FOREIGN KEY (tenant_id,liability_account_id) REFERENCES financial_accounts(tenant_id,id)
);
ALTER TABLE payment_parts ADD CONSTRAINT payment_parts_deposit_fk
  FOREIGN KEY (tenant_id,deposit_id) REFERENCES patient_deposits(tenant_id,id);

CREATE TABLE deposit_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), deposit_id uuid NOT NULL,
  payment_part_id uuid NOT NULL, amount_minor bigint NOT NULL CHECK (amount_minor > 0), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,payment_part_id),
  FOREIGN KEY (tenant_id,deposit_id) REFERENCES patient_deposits(tenant_id,id),
  FOREIGN KEY (tenant_id,payment_part_id) REFERENCES payment_parts(tenant_id,id)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), payment_id uuid NOT NULL,
  ledger_transaction_id uuid NOT NULL, total_amount_minor bigint NOT NULL CHECK (total_amount_minor > 0),
  reason varchar(1000) NOT NULL, idempotency_key varchar(128) NOT NULL, posted_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid NOT NULL REFERENCES users(id), UNIQUE (tenant_id,id), UNIQUE (tenant_id,idempotency_key),
  UNIQUE (tenant_id,ledger_transaction_id), FOREIGN KEY (tenant_id,payment_id) REFERENCES payments(tenant_id,id),
  FOREIGN KEY (tenant_id,ledger_transaction_id) REFERENCES ledger_transactions(tenant_id,id)
);

CREATE TABLE refund_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), refund_id uuid NOT NULL,
  payment_part_id uuid NOT NULL, payment_allocation_id uuid, deposit_id uuid, amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,refund_id) REFERENCES refunds(tenant_id,id),
  FOREIGN KEY (tenant_id,payment_part_id) REFERENCES payment_parts(tenant_id,id),
  FOREIGN KEY (tenant_id,payment_allocation_id) REFERENCES payment_allocations(tenant_id,id),
  FOREIGN KEY (tenant_id,deposit_id) REFERENCES patient_deposits(tenant_id,id),
  CHECK ((payment_allocation_id IS NOT NULL)::int + (deposit_id IS NOT NULL)::int = 1)
);

CREATE TABLE cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), cashbox_id uuid NOT NULL,
  cash_session_id uuid NOT NULL, direction varchar(16) NOT NULL CHECK (direction IN ('inflow','outflow')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0), source_type varchar(24) NOT NULL, source_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(), recorded_by uuid NOT NULL REFERENCES users(id), UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,cashbox_id,source_type,source_id), FOREIGN KEY (tenant_id,cashbox_id) REFERENCES cashboxes(tenant_id,id),
  FOREIGN KEY (tenant_id,cash_session_id) REFERENCES cash_sessions(tenant_id,id)
);

CREATE TABLE expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), code varchar(32) NOT NULL,
  name varchar(160) NOT NULL, expense_account_id uuid NOT NULL, currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), archived_at timestamptz,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,code,currency),
  FOREIGN KEY (tenant_id,expense_account_id) REFERENCES financial_accounts(tenant_id,id)
);

CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), branch_id uuid NOT NULL,
  category_id uuid NOT NULL, cashbox_id uuid NOT NULL, cash_session_id uuid NOT NULL, ledger_transaction_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0), description varchar(500) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(), posted_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid NOT NULL REFERENCES users(id), UNIQUE (tenant_id,id), UNIQUE (tenant_id,ledger_transaction_id),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id),
  FOREIGN KEY (tenant_id,category_id) REFERENCES expense_categories(tenant_id,id),
  FOREIGN KEY (tenant_id,cashbox_id) REFERENCES cashboxes(tenant_id,id),
  FOREIGN KEY (tenant_id,cash_session_id) REFERENCES cash_sessions(tenant_id,id),
  FOREIGN KEY (tenant_id,ledger_transaction_id) REFERENCES ledger_transactions(tenant_id,id)
);

CREATE OR REPLACE FUNCTION reject_posted_finance_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'posted finance rows are immutable; create a reversal or refund' USING ERRCODE='55000'; END $$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['ledger_transactions','ledger_entries','charges','charge_items','payments','payment_parts',
    'payment_allocations','patient_deposits','deposit_allocations','refunds','refund_allocations','cash_transactions','expenses'] LOOP
    EXECUTE format('CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_posted_finance_change()', table_name, table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION assert_balanced_ledger_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; entry_count integer; entry_sum numeric;
BEGIN
  target_id := COALESCE(NEW.transaction_id,OLD.transaction_id);
  SELECT count(*),COALESCE(sum(amount_minor),0) INTO entry_count,entry_sum FROM ledger_entries WHERE transaction_id=target_id;
  IF entry_count < 2 OR entry_sum <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is not balanced',target_id USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_ledger_transaction();

CREATE OR REPLACE FUNCTION protect_closed_cash_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='closed' THEN RAISE EXCEPTION 'closed cash session is immutable' USING ERRCODE='55000'; END IF;
  IF NEW.status NOT IN ('open','closed') THEN RAISE EXCEPTION 'invalid cash session status' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cash_sessions_closed_immutable BEFORE UPDATE OR DELETE ON cash_sessions
  FOR EACH ROW EXECUTE FUNCTION protect_closed_cash_session();

CREATE INDEX ledger_entries_patient_idx ON ledger_entries (tenant_id,patient_id,created_at,id);
CREATE INDEX payment_allocations_charge_idx ON payment_allocations (tenant_id,charge_id);
CREATE INDEX refunds_payment_idx ON refunds (tenant_id,payment_id);
CREATE INDEX cash_transactions_session_idx ON cash_transactions (tenant_id,cash_session_id,occurred_at);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['financial_accounts','ledger_transactions','ledger_entries','charges','charge_items','payments',
    'payment_parts','payment_allocations','patient_deposits','deposit_allocations','refunds','refund_allocations','cashboxes',
    'cash_sessions','cash_transactions','expense_categories','expenses'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',table_name);
  END LOOP;
END $$;

INSERT INTO permissions (key,description) VALUES
  ('finance.read','Read financial records'), ('finance.charge.create','Post patient charges'),
  ('finance.payment.create','Post payments and deposits'), ('finance.payment.refund','Post payment refunds'),
  ('finance.ledger.adjust','Post ledger adjustments'), ('finance.cashbox.manage','Manage cashboxes and sessions'),
  ('finance.expense.create','Post cash expenses') ON CONFLICT (key) DO NOTHING;

GRANT SELECT,INSERT ON financial_accounts,ledger_transactions,ledger_entries,charges,charge_items,payments,payment_parts,
  payment_allocations,patient_deposits,deposit_allocations,refunds,refund_allocations,cashboxes,cash_transactions,
  expense_categories,expenses TO dental_app;
GRANT SELECT,INSERT,UPDATE ON cash_sessions TO dental_app;
