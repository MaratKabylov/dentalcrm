begin;

alter table public.payments
  drop constraint payments_status_check,
  drop constraint payments_reversal_state_check;

alter table public.payments
  add column refunded_amount numeric(14,2) not null default 0;

alter table public.payments
  add constraint payments_status_check
    check (status in ('posted', 'partially_refunded', 'refunded', 'reversed')),
  add constraint payments_refunded_amount_check
    check (refunded_amount >= 0 and refunded_amount <= amount),
  add constraint payments_state_check check (
    (
      status = 'posted'
      and refunded_amount = 0
      and reversed_at is null
      and reversed_by is null
      and reversal_reason is null
    )
    or (
      status = 'partially_refunded'
      and refunded_amount > 0
      and refunded_amount < amount
      and reversed_at is null
      and reversed_by is null
      and reversal_reason is null
    )
    or (
      status = 'refunded'
      and refunded_amount = amount
      and reversed_at is null
      and reversed_by is null
      and reversal_reason is null
    )
    or (
      status = 'reversed'
      and refunded_amount = 0
      and reversed_at is not null
      and reversed_by is not null
      and reversal_reason is not null
      and char_length(trim(reversal_reason)) between 3 and 500
    )
  );

create table public.payment_refund_number_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0)
);

create table public.payment_reversals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null,
  invoice_id uuid not null,
  patient_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  reversed_by uuid not null references public.profiles(id) on delete restrict,
  reversed_at timestamptz not null default now(),
  constraint payment_reversals_payment_fkey foreign key (organization_id, payment_id)
    references public.payments(organization_id, id) on delete restrict,
  constraint payment_reversals_invoice_fkey foreign key (organization_id, invoice_id)
    references public.invoices(organization_id, id) on delete restrict,
  constraint payment_reversals_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, payment_id)
);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  invoice_id uuid not null,
  payment_id uuid not null,
  cash_desk_id uuid not null,
  cash_shift_id uuid not null,
  payment_method_id uuid not null,
  refund_number text not null check (char_length(refund_number) between 5 and 40),
  amount numeric(14,2) not null check (amount > 0),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  external_reference text check (
    external_reference is null or char_length(trim(external_reference)) between 1 and 200
  ),
  refunded_by uuid not null references public.profiles(id) on delete restrict,
  refunded_at timestamptz not null default now(),
  constraint payment_refunds_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint payment_refunds_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint payment_refunds_invoice_fkey foreign key (organization_id, invoice_id)
    references public.invoices(organization_id, id) on delete restrict,
  constraint payment_refunds_payment_fkey foreign key (organization_id, payment_id)
    references public.payments(organization_id, id) on delete restrict,
  constraint payment_refunds_cash_desk_fkey foreign key (organization_id, cash_desk_id)
    references public.cash_desks(organization_id, id) on delete restrict,
  constraint payment_refunds_cash_shift_fkey foreign key (organization_id, cash_desk_id, cash_shift_id)
    references public.cash_shifts(organization_id, cash_desk_id, id) on delete restrict,
  constraint payment_refunds_method_fkey foreign key (organization_id, payment_method_id)
    references public.payment_methods(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, refund_number)
);

create index payment_refunds_payment_refunded_idx
  on public.payment_refunds (payment_id, refunded_at desc);
create index payment_refunds_shift_refunded_idx
  on public.payment_refunds (cash_shift_id, refunded_at);
create index payment_refunds_patient_refunded_idx
  on public.payment_refunds (patient_id, refunded_at desc);

alter table public.patient_ledger_entries
  drop constraint patient_ledger_entries_entry_type_check,
  drop constraint patient_ledger_reference_check;

alter table public.patient_ledger_entries
  add column payment_reversal_id uuid,
  add column payment_refund_id uuid,
  add constraint patient_ledger_reversal_fkey
    foreign key (organization_id, payment_reversal_id)
    references public.payment_reversals(organization_id, id) on delete restrict,
  add constraint patient_ledger_refund_fkey
    foreign key (organization_id, payment_refund_id)
    references public.payment_refunds(organization_id, id) on delete restrict,
  add constraint patient_ledger_entry_type_check
    check (entry_type in ('charge', 'payment', 'refund', 'reversal', 'adjustment')),
  add constraint patient_ledger_reference_check check (
    (
      entry_type = 'charge'
      and invoice_id is not null
      and payment_id is null
      and payment_reversal_id is null
      and payment_refund_id is null
    )
    or (
      entry_type = 'payment'
      and invoice_id is not null
      and payment_id is not null
      and payment_reversal_id is null
      and payment_refund_id is null
    )
    or (
      entry_type = 'reversal'
      and invoice_id is not null
      and payment_id is null
      and payment_reversal_id is not null
      and payment_refund_id is null
    )
    or (
      entry_type = 'refund'
      and invoice_id is not null
      and payment_id is null
      and payment_reversal_id is null
      and payment_refund_id is not null
    )
    or entry_type = 'adjustment'
  );

create unique index patient_ledger_reversal_idx
  on public.patient_ledger_entries (payment_reversal_id)
  where payment_reversal_id is not null;
create unique index patient_ledger_refund_idx
  on public.patient_ledger_entries (payment_refund_id)
  where payment_refund_id is not null;

alter table public.payment_refund_number_counters enable row level security;
alter table public.payment_reversals enable row level security;
alter table public.payment_refunds enable row level security;

create policy payment_reversals_select on public.payment_reversals
for select to authenticated
using (public.current_user_has_permission(organization_id, 'finance.read'));

create policy payment_refunds_select on public.payment_refunds
for select to authenticated
using (public.current_user_has_permission(organization_id, 'finance.read'));

grant select on public.payment_reversals, public.payment_refunds to authenticated;

create or replace function public.reverse_payment(
  org_id uuid,
  target_payment_id uuid,
  reversal_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payment_invoice_id uuid;
  payment_patient_id uuid;
  payment_shift_id uuid;
  payment_receipt_number text;
  payment_status text;
  payment_amount numeric(14,2);
  payment_refunded_amount numeric(14,2);
  shift_status text;
  invoice_paid_amount numeric(14,2);
  invoice_total_amount numeric(14,2);
  new_paid_amount numeric(14,2);
  new_reversal_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'finance.manage')
    or not public.current_user_has_permission(org_id, 'cashdesk.manage')
  then
    raise exception 'Finance and cash desk manage permissions required' using errcode = '42501';
  end if;
  if reversal_reason is null or char_length(trim(reversal_reason)) not between 3 and 500 then
    raise exception 'Reversal reason is invalid';
  end if;

  select
    payment.invoice_id,
    payment.patient_id,
    payment.cash_shift_id,
    payment.receipt_number,
    payment.status,
    payment.amount,
    payment.refunded_amount
  into
    payment_invoice_id,
    payment_patient_id,
    payment_shift_id,
    payment_receipt_number,
    payment_status,
    payment_amount,
    payment_refunded_amount
  from public.payments payment
  where payment.id = target_payment_id and payment.organization_id = org_id
  for update;
  if payment_invoice_id is null then
    raise exception 'Invoice payment not found';
  end if;
  if payment_status <> 'posted' or payment_refunded_amount <> 0 then
    raise exception 'Only an unreimbursed posted payment can be reversed';
  end if;

  select shift.status into shift_status
  from public.cash_shifts shift
  where shift.id = payment_shift_id and shift.organization_id = org_id
  for update;
  if shift_status <> 'open' then
    raise exception 'A payment can only be reversed during its open cash shift';
  end if;

  select invoice.paid_amount, invoice.total_amount
  into invoice_paid_amount, invoice_total_amount
  from public.invoices invoice
  where invoice.id = payment_invoice_id and invoice.organization_id = org_id
  for update;
  if invoice_paid_amount is null or invoice_paid_amount < payment_amount then
    raise exception 'Invoice payment balance is inconsistent';
  end if;

  new_paid_amount := invoice_paid_amount - payment_amount;

  update public.payments
  set status = 'reversed',
      reversed_at = now(),
      reversed_by = auth.uid(),
      reversal_reason = trim(reversal_reason)
  where id = target_payment_id and organization_id = org_id;

  insert into public.payment_reversals (
    organization_id, payment_id, invoice_id, patient_id,
    amount, reason, reversed_by
  ) values (
    org_id, target_payment_id, payment_invoice_id, payment_patient_id,
    payment_amount, trim(reversal_reason), auth.uid()
  ) returning id into new_reversal_id;

  update public.invoices
  set paid_amount = new_paid_amount,
      debt_amount = invoice_total_amount - new_paid_amount,
      status = case when new_paid_amount = 0 then 'issued' else 'partially_paid' end
  where id = payment_invoice_id and organization_id = org_id;

  insert into public.patient_ledger_entries (
    organization_id, patient_id, invoice_id, payment_reversal_id, entry_type,
    debit_amount, credit_amount, description, occurred_at, created_by
  ) values (
    org_id, payment_patient_id, payment_invoice_id, new_reversal_id, 'reversal',
    payment_amount, 0, 'Сторно оплаты ' || payment_receipt_number, now(), auth.uid()
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    org_id, auth.uid(), 'payment.reversed', 'payment', target_payment_id,
    jsonb_build_object('status', 'posted', 'paid_amount', invoice_paid_amount),
    jsonb_build_object(
      'status', 'reversed',
      'reason', trim(reversal_reason),
      'invoice_id', payment_invoice_id,
      'amount', payment_amount,
      'invoice_paid_amount', new_paid_amount
    )
  );

  return payment_invoice_id;
end;
$$;

create or replace function public.record_payment_refund(
  org_id uuid,
  target_payment_id uuid,
  target_cash_shift_id uuid,
  target_payment_method_id uuid,
  refund_amount numeric,
  refund_reason text,
  refund_external_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payment_branch_id uuid;
  payment_invoice_id uuid;
  payment_patient_id uuid;
  payment_receipt_number text;
  payment_status text;
  payment_amount numeric(14,2);
  already_refunded numeric(14,2);
  available_refund numeric(14,2);
  resolved_cash_desk_id uuid;
  cash_desk_branch_id uuid;
  shift_status text;
  payment_method_code text;
  cash_available numeric(14,2);
  invoice_paid_amount numeric(14,2);
  invoice_total_amount numeric(14,2);
  new_paid_amount numeric(14,2);
  next_refund_number bigint;
  generated_refund_number text;
  new_refund_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'finance.manage')
    or not public.current_user_has_permission(org_id, 'cashdesk.manage')
  then
    raise exception 'Finance and cash desk manage permissions required' using errcode = '42501';
  end if;
  if refund_amount is null or refund_amount <= 0 or round(refund_amount, 2) <> refund_amount then
    raise exception 'Refund amount is invalid';
  end if;
  if refund_reason is null or char_length(trim(refund_reason)) not between 3 and 500 then
    raise exception 'Refund reason is invalid';
  end if;
  if refund_external_reference is not null
    and char_length(trim(refund_external_reference)) > 200
  then
    raise exception 'Refund external reference is too long';
  end if;

  select
    payment.branch_id,
    payment.invoice_id,
    payment.patient_id,
    payment.receipt_number,
    payment.status,
    payment.amount,
    payment.refunded_amount
  into
    payment_branch_id,
    payment_invoice_id,
    payment_patient_id,
    payment_receipt_number,
    payment_status,
    payment_amount,
    already_refunded
  from public.payments payment
  where payment.id = target_payment_id and payment.organization_id = org_id
  for update;
  if payment_invoice_id is null then
    raise exception 'Invoice payment not found';
  end if;
  if payment_status not in ('posted', 'partially_refunded') then
    raise exception 'Payment is not refundable';
  end if;

  available_refund := payment_amount - already_refunded;
  if refund_amount > available_refund then
    raise exception 'Refund amount exceeds refundable payment balance';
  end if;

  select invoice.paid_amount, invoice.total_amount
  into invoice_paid_amount, invoice_total_amount
  from public.invoices invoice
  where invoice.id = payment_invoice_id and invoice.organization_id = org_id
  for update;
  if invoice_paid_amount is null or invoice_paid_amount < refund_amount then
    raise exception 'Refund amount exceeds invoice paid amount';
  end if;

  select shift.cash_desk_id, shift.status, cash_desk.branch_id
  into resolved_cash_desk_id, shift_status, cash_desk_branch_id
  from public.cash_shifts shift
  join public.cash_desks cash_desk
    on cash_desk.id = shift.cash_desk_id
    and cash_desk.organization_id = shift.organization_id
  join public.branches branch
    on branch.id = cash_desk.branch_id
    and branch.organization_id = cash_desk.organization_id
  where shift.id = target_cash_shift_id
    and shift.organization_id = org_id
    and cash_desk.is_active
    and branch.is_active
  for update of shift;
  if resolved_cash_desk_id is null then
    raise exception 'Cash shift not found';
  end if;
  if shift_status <> 'open' then
    raise exception 'Cash shift is closed';
  end if;
  if cash_desk_branch_id <> payment_branch_id then
    raise exception 'Cash desk and payment belong to different branches';
  end if;

  select method.code into payment_method_code
  from public.payment_methods method
  where method.id = target_payment_method_id
    and method.organization_id = org_id
    and method.is_active;
  if payment_method_code is null then
    raise exception 'Active payment method not found';
  end if;

  if payment_method_code = 'cash' then
    select
      shift.opening_balance
      + coalesce((
        select sum(payment.amount)
        from public.payments payment
        join public.payment_methods method
          on method.id = payment.payment_method_id
          and method.organization_id = payment.organization_id
        where payment.organization_id = org_id
          and payment.cash_shift_id = target_cash_shift_id
          and payment.status <> 'reversed'
          and method.code = 'cash'
      ), 0)
      - coalesce((
        select sum(refund.amount)
        from public.payment_refunds refund
        join public.payment_methods method
          on method.id = refund.payment_method_id
          and method.organization_id = refund.organization_id
        where refund.organization_id = org_id
          and refund.cash_shift_id = target_cash_shift_id
          and method.code = 'cash'
      ), 0)
    into cash_available
    from public.cash_shifts shift
    where shift.id = target_cash_shift_id and shift.organization_id = org_id;
    if cash_available < refund_amount then
      raise exception 'Cash desk does not have enough expected cash for refund';
    end if;
  end if;

  insert into public.payment_refund_number_counters (organization_id, last_value)
  values (org_id, 1)
  on conflict (organization_id)
  do update set last_value = public.payment_refund_number_counters.last_value + 1
  returning last_value into next_refund_number;
  generated_refund_number := 'REF-' || lpad(next_refund_number::text, 8, '0');

  insert into public.payment_refunds (
    organization_id, branch_id, patient_id, invoice_id, payment_id,
    cash_desk_id, cash_shift_id, payment_method_id, refund_number,
    amount, reason, external_reference, refunded_by
  ) values (
    org_id, payment_branch_id, payment_patient_id, payment_invoice_id, target_payment_id,
    resolved_cash_desk_id, target_cash_shift_id, target_payment_method_id, generated_refund_number,
    refund_amount, trim(refund_reason), nullif(trim(refund_external_reference), ''), auth.uid()
  ) returning id into new_refund_id;

  update public.payments
  set refunded_amount = refunded_amount + refund_amount,
      status = case
        when refunded_amount + refund_amount = amount then 'refunded'
        else 'partially_refunded'
      end
  where id = target_payment_id and organization_id = org_id;

  new_paid_amount := invoice_paid_amount - refund_amount;
  update public.invoices
  set paid_amount = new_paid_amount,
      debt_amount = invoice_total_amount - new_paid_amount,
      status = case when new_paid_amount = 0 then 'issued' else 'partially_paid' end
  where id = payment_invoice_id and organization_id = org_id;

  insert into public.patient_ledger_entries (
    organization_id, patient_id, invoice_id, payment_refund_id, entry_type,
    debit_amount, credit_amount, description, occurred_at, created_by
  ) values (
    org_id, payment_patient_id, payment_invoice_id, new_refund_id, 'refund',
    refund_amount, 0, 'Возврат ' || generated_refund_number || ' по оплате ' || payment_receipt_number,
    now(), auth.uid()
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'payment.refunded', 'payment_refund', new_refund_id,
    jsonb_build_object(
      'refund_number', generated_refund_number,
      'payment_id', target_payment_id,
      'invoice_id', payment_invoice_id,
      'cash_shift_id', target_cash_shift_id,
      'payment_method', payment_method_code,
      'amount', refund_amount,
      'reason', trim(refund_reason),
      'payment_refunded_amount', already_refunded + refund_amount,
      'invoice_paid_amount', new_paid_amount
    )
  );

  return new_refund_id;
end;
$$;

create or replace function public.close_cash_shift(
  org_id uuid,
  target_shift_id uuid,
  counted_closing_balance numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  shift_cash_desk_id uuid;
  shift_status text;
  shift_opening_balance numeric(14,2);
  cash_payments_total numeric(14,2);
  cash_refunds_total numeric(14,2);
  expected_balance numeric(14,2);
begin
  if not public.current_user_has_permission(org_id, 'cashdesk.manage') then
    raise exception 'Cash desk manage permission required' using errcode = '42501';
  end if;
  if counted_closing_balance is null or counted_closing_balance < 0 then
    raise exception 'Closing balance is invalid';
  end if;

  select shift.cash_desk_id, shift.status, shift.opening_balance
  into shift_cash_desk_id, shift_status, shift_opening_balance
  from public.cash_shifts shift
  where shift.id = target_shift_id and shift.organization_id = org_id
  for update;
  if shift_cash_desk_id is null then
    raise exception 'Cash shift not found';
  end if;
  if shift_status <> 'open' then
    raise exception 'Cash shift is already closed';
  end if;

  select coalesce(sum(payment.amount), 0)
  into cash_payments_total
  from public.payments payment
  join public.payment_methods method
    on method.id = payment.payment_method_id
    and method.organization_id = payment.organization_id
  where payment.organization_id = org_id
    and payment.cash_shift_id = target_shift_id
    and payment.status <> 'reversed'
    and method.code = 'cash';

  select coalesce(sum(refund.amount), 0)
  into cash_refunds_total
  from public.payment_refunds refund
  join public.payment_methods method
    on method.id = refund.payment_method_id
    and method.organization_id = refund.organization_id
  where refund.organization_id = org_id
    and refund.cash_shift_id = target_shift_id
    and method.code = 'cash';

  expected_balance := shift_opening_balance + cash_payments_total - cash_refunds_total;
  update public.cash_shifts
  set status = 'closed',
      closed_by = auth.uid(),
      closed_at = now(),
      expected_closing_balance = expected_balance,
      closing_balance = counted_closing_balance,
      difference_amount = counted_closing_balance - expected_balance
  where id = target_shift_id and organization_id = org_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'cash_shift.closed', 'cash_shift', target_shift_id,
    jsonb_build_object(
      'cash_desk_id', shift_cash_desk_id,
      'cash_payments_total', cash_payments_total,
      'cash_refunds_total', cash_refunds_total,
      'expected_closing_balance', expected_balance,
      'closing_balance', counted_closing_balance,
      'difference_amount', counted_closing_balance - expected_balance
    )
  );
end;
$$;

drop function public.list_cash_desks(uuid);

create function public.list_cash_desks(org_id uuid)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  name text,
  is_active boolean,
  open_shift_id uuid,
  opened_at timestamptz,
  opened_by_name text,
  opening_balance numeric,
  cash_payments_total numeric,
  cash_refunds_total numeric,
  expected_cash_balance numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    cash_desk.id,
    cash_desk.branch_id,
    branch.name,
    cash_desk.name,
    cash_desk.is_active,
    shift.id,
    shift.opened_at,
    profile.full_name,
    shift.opening_balance,
    coalesce(cash_total.amount, 0),
    coalesce(refund_total.amount, 0),
    case
      when shift.id is null then null
      else shift.opening_balance + coalesce(cash_total.amount, 0) - coalesce(refund_total.amount, 0)
    end
  from public.cash_desks cash_desk
  join public.branches branch
    on branch.id = cash_desk.branch_id and branch.organization_id = cash_desk.organization_id
  left join public.cash_shifts shift
    on shift.cash_desk_id = cash_desk.id
    and shift.organization_id = cash_desk.organization_id
    and shift.status = 'open'
  left join public.profiles profile on profile.id = shift.opened_by
  left join lateral (
    select sum(payment.amount) as amount
    from public.payments payment
    join public.payment_methods method
      on method.id = payment.payment_method_id
      and method.organization_id = payment.organization_id
    where payment.cash_shift_id = shift.id
      and payment.organization_id = cash_desk.organization_id
      and payment.status <> 'reversed'
      and method.code = 'cash'
  ) cash_total on true
  left join lateral (
    select sum(refund.amount) as amount
    from public.payment_refunds refund
    join public.payment_methods method
      on method.id = refund.payment_method_id
      and method.organization_id = refund.organization_id
    where refund.cash_shift_id = shift.id
      and refund.organization_id = cash_desk.organization_id
      and method.code = 'cash'
  ) refund_total on true
  where cash_desk.organization_id = org_id
    and public.current_user_has_permission(org_id, 'finance.read')
  order by branch.name, cash_desk.name;
$$;

drop function public.list_payments(uuid, uuid, integer);

create function public.list_payments(
  org_id uuid,
  target_patient_id uuid default null,
  result_limit integer default 100
)
returns table (
  id uuid,
  receipt_number text,
  patient_id uuid,
  patient_name text,
  invoice_id uuid,
  invoice_number text,
  branch_id uuid,
  cash_desk_name text,
  branch_name text,
  cash_shift_id uuid,
  cash_shift_status text,
  payment_method_code text,
  payment_method_name text,
  amount numeric,
  refunded_amount numeric,
  paid_at timestamptz,
  status text,
  external_reference text,
  reversal_reason text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    payment.id,
    payment.receipt_number,
    payment.patient_id,
    trim(concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name)),
    payment.invoice_id,
    invoice.invoice_number,
    payment.branch_id,
    cash_desk.name,
    branch.name,
    payment.cash_shift_id,
    shift.status,
    method.code,
    method.name,
    payment.amount,
    payment.refunded_amount,
    payment.paid_at,
    payment.status,
    payment.external_reference,
    payment.reversal_reason
  from public.payments payment
  join public.patients patient
    on patient.id = payment.patient_id and patient.organization_id = payment.organization_id
  left join public.invoices invoice
    on invoice.id = payment.invoice_id and invoice.organization_id = payment.organization_id
  join public.cash_desks cash_desk
    on cash_desk.id = payment.cash_desk_id and cash_desk.organization_id = payment.organization_id
  join public.cash_shifts shift
    on shift.id = payment.cash_shift_id and shift.organization_id = payment.organization_id
  join public.branches branch
    on branch.id = payment.branch_id and branch.organization_id = payment.organization_id
  join public.payment_methods method
    on method.id = payment.payment_method_id and method.organization_id = payment.organization_id
  where payment.organization_id = org_id
    and (target_patient_id is null or payment.patient_id = target_patient_id)
    and public.current_user_has_permission(org_id, 'finance.read')
  order by payment.paid_at desc
  limit least(greatest(result_limit, 1), 500);
$$;

create or replace function public.list_payment_refunds(
  org_id uuid,
  target_patient_id uuid default null,
  result_limit integer default 100
)
returns table (
  id uuid,
  refund_number text,
  payment_id uuid,
  receipt_number text,
  patient_id uuid,
  patient_name text,
  invoice_id uuid,
  invoice_number text,
  cash_desk_name text,
  branch_name text,
  payment_method_name text,
  amount numeric,
  reason text,
  external_reference text,
  refunded_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    refund.id,
    refund.refund_number,
    refund.payment_id,
    payment.receipt_number,
    refund.patient_id,
    trim(concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name)),
    refund.invoice_id,
    invoice.invoice_number,
    cash_desk.name,
    branch.name,
    method.name,
    refund.amount,
    refund.reason,
    refund.external_reference,
    refund.refunded_at
  from public.payment_refunds refund
  join public.payments payment
    on payment.id = refund.payment_id and payment.organization_id = refund.organization_id
  join public.patients patient
    on patient.id = refund.patient_id and patient.organization_id = refund.organization_id
  join public.invoices invoice
    on invoice.id = refund.invoice_id and invoice.organization_id = refund.organization_id
  join public.cash_desks cash_desk
    on cash_desk.id = refund.cash_desk_id and cash_desk.organization_id = refund.organization_id
  join public.branches branch
    on branch.id = refund.branch_id and branch.organization_id = refund.organization_id
  join public.payment_methods method
    on method.id = refund.payment_method_id and method.organization_id = refund.organization_id
  where refund.organization_id = org_id
    and (target_patient_id is null or refund.patient_id = target_patient_id)
    and public.current_user_has_permission(org_id, 'finance.read')
  order by refund.refunded_at desc
  limit least(greatest(result_limit, 1), 500);
$$;

revoke all on function public.reverse_payment(uuid, uuid, text) from public;
revoke all on function public.record_payment_refund(uuid, uuid, uuid, uuid, numeric, text, text) from public;
revoke all on function public.list_cash_desks(uuid) from public;
revoke all on function public.list_payments(uuid, uuid, integer) from public;
revoke all on function public.list_payment_refunds(uuid, uuid, integer) from public;

grant execute on function public.reverse_payment(uuid, uuid, text) to authenticated;
grant execute on function public.record_payment_refund(uuid, uuid, uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.list_cash_desks(uuid) to authenticated;
grant execute on function public.list_payments(uuid, uuid, integer) to authenticated;
grant execute on function public.list_payment_refunds(uuid, uuid, integer) to authenticated;

commit;
