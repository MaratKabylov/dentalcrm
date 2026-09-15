CREATE OR REPLACE FUNCTION assert_balanced_ledger_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; entry_count integer; entry_sum numeric; currency_mismatches integer;
BEGIN
  IF TG_TABLE_NAME='ledger_transactions' THEN target_id:=COALESCE(NEW.id,OLD.id);
  ELSE target_id:=COALESCE(NEW.transaction_id,OLD.transaction_id); END IF;
  SELECT count(*),COALESCE(sum(e.amount_minor),0),
    count(*) FILTER (WHERE a.currency<>t.currency)
    INTO entry_count,entry_sum,currency_mismatches
    FROM ledger_entries e JOIN financial_accounts a ON a.id=e.account_id
    JOIN ledger_transactions t ON t.id=e.transaction_id WHERE e.transaction_id=target_id;
  IF entry_count<2 OR entry_sum<>0 OR currency_mismatches<>0 THEN
    RAISE EXCEPTION 'ledger transaction % is incomplete, unbalanced, or mixes currencies',target_id USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ledger_transactions_balanced AFTER INSERT ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_ledger_transaction();

CREATE OR REPLACE FUNCTION assert_charge_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; expected numeric; actual numeric;
BEGIN
  target_id:=COALESCE(NEW.charge_id,OLD.charge_id);
  SELECT total_amount_minor INTO expected FROM charges WHERE id=target_id;
  SELECT COALESCE(sum(total_amount_minor),0) INTO actual FROM charge_items WHERE charge_id=target_id;
  IF expected IS DISTINCT FROM actual THEN RAISE EXCEPTION 'charge item total does not match charge total' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER charge_items_total AFTER INSERT OR UPDATE OR DELETE ON charge_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_charge_total();

CREATE OR REPLACE FUNCTION assert_payment_parts_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; expected numeric; actual numeric;
BEGIN
  target_id:=COALESCE(NEW.payment_id,OLD.payment_id);
  SELECT total_amount_minor INTO expected FROM payments WHERE id=target_id;
  SELECT COALESCE(sum(amount_minor),0) INTO actual FROM payment_parts WHERE payment_id=target_id;
  IF expected IS DISTINCT FROM actual THEN RAISE EXCEPTION 'payment part total does not match payment total' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payment_parts_total AFTER INSERT OR UPDATE OR DELETE ON payment_parts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_payment_parts_total();

CREATE OR REPLACE FUNCTION assert_refund_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; expected numeric; actual numeric;
BEGIN
  target_id:=COALESCE(NEW.refund_id,OLD.refund_id);
  SELECT total_amount_minor INTO expected FROM refunds WHERE id=target_id;
  SELECT COALESCE(sum(amount_minor),0) INTO actual FROM refund_allocations WHERE refund_id=target_id;
  IF expected IS DISTINCT FROM actual THEN RAISE EXCEPTION 'refund allocation total does not match refund total' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER refund_allocations_total AFTER INSERT OR UPDATE OR DELETE ON refund_allocations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_refund_total();
