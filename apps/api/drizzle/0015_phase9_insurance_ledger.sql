-- Insurance settlements participate in the Phase 3 append-only general ledger.
ALTER TABLE insurance_payments ADD COLUMN ledger_transaction_id uuid NOT NULL;
ALTER TABLE insurance_payments ADD CONSTRAINT insurance_payments_ledger_unique UNIQUE(tenant_id,ledger_transaction_id);
ALTER TABLE insurance_payments ADD CONSTRAINT insurance_payments_ledger_fk
  FOREIGN KEY(tenant_id,ledger_transaction_id) REFERENCES ledger_transactions(tenant_id,id);

