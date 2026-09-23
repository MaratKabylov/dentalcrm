create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code in ('cash', 'card', 'kaspi', 'bank_transfer', 'other')),
  name text not null check (char_length(trim(name)) between 2 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code)
);

create table public.cash_desks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_desks_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, branch_id, name)
);

create table public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cash_desk_id uuid not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_by uuid not null references public.profiles(id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_balance numeric(14,2) not null check (opening_balance >= 0),
  closed_by uuid references public.profiles(id) on delete restrict,
  closed_at timestamptz,
  expected_closing_balance numeric(14,2),
  closing_balance numeric(14,2),
  difference_amount numeric(14,2),
  created_at timestamptz not null default now(),
  constraint cash_shifts_cash_desk_fkey foreign key (organization_id, cash_desk_id)
    references public.cash_desks(organization_id, id) on delete restrict,
  constraint cash_shifts_close_state_check check (
    (
      status = 'open'
      and closed_by is null
      and closed_at is null
      and expected_closing_balance is null
      and closing_balance is null
      and difference_amount is null
    )
    or (
      status = 'closed'
      and closed_by is not null
      and closed_at is not null
      and expected_closing_balance is not null
      and expected_closing_balance >= 0
      and closing_balance is not null
      and closing_balance >= 0
      and difference_amount = closing_balance - expected_closing_balance
    )
  ),
  unique (organization_id, id),
  unique (organization_id, cash_desk_id, id)
);

create unique index cash_shifts_one_open_per_desk_idx
  on public.cash_shifts (organization_id, cash_desk_id)
  where status = 'open';
create index cash_shifts_desk_opened_idx
  on public.cash_shifts (cash_desk_id, opened_at desc);

create table public.payment_number_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0)
);

alter table public.payment_number_counters enable row level security;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  invoice_id uuid,
  cash_desk_id uuid not null,
  cash_shift_id uuid not null,
  payment_method_id uuid not null,
  receipt_number text not null check (char_length(receipt_number) between 5 and 40),
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  external_reference text check (
    external_reference is null or char_length(trim(external_reference)) between 1 and 200
  ),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete restrict,
  reversal_reason text,
  constraint payments_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint payments_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint payments_invoice_fkey foreign key (organization_id, invoice_id)
    references public.invoices(organization_id, id) on delete restrict,
  constraint payments_cash_desk_fkey foreign key (organization_id, cash_desk_id)
    references public.cash_desks(organization_id, id) on delete restrict,
  constraint payments_cash_shift_fkey foreign key (organization_id, cash_desk_id, cash_shift_id)
    references public.cash_shifts(organization_id, cash_desk_id, id) on delete restrict,
  constraint payments_method_fkey foreign key (organization_id, payment_method_id)
    references public.payment_methods(organization_id, id) on delete restrict,
  constraint payments_reversal_state_check check (
    (status = 'posted' and reversed_at is null and reversed_by is null and reversal_reason is null)
    or (
      status = 'reversed'
      and reversed_at is not null
      and reversed_by is not null
      and reversal_reason is not null
      and char_length(trim(reversal_reason)) between 3 and 500
    )
  ),
  unique (organization_id, id),
  unique (organization_id, receipt_number)
);

create index payments_invoice_paid_idx on public.payments (invoice_id, paid_at);
create index payments_patient_paid_idx on public.payments (patient_id, paid_at desc);
create index payments_shift_paid_idx on public.payments (cash_shift_id, paid_at);

create table public.patient_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  invoice_id uuid,
  payment_id uuid,
  entry_type text not null check (entry_type in ('charge', 'payment', 'refund', 'adjustment')),
  debit_amount numeric(14,2) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(14,2) not null default 0 check (credit_amount >= 0),
  description text not null check (char_length(trim(description)) between 2 and 500),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint patient_ledger_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint patient_ledger_invoice_fkey foreign key (organization_id, invoice_id)
    references public.invoices(organization_id, id) on delete restrict,
  constraint patient_ledger_payment_fkey foreign key (organization_id, payment_id)
    references public.payments(organization_id, id) on delete restrict,
  constraint patient_ledger_amount_check check (
    (debit_amount > 0 and credit_amount = 0)
    or (credit_amount > 0 and debit_amount = 0)
  ),
  constraint patient_ledger_reference_check check (
    (entry_type = 'charge' and invoice_id is not null and payment_id is null)
    or (entry_type = 'payment' and payment_id is not null and invoice_id is not null)
    or (entry_type in ('refund', 'adjustment'))
  ),
  unique (organization_id, id)
);

create unique index patient_ledger_invoice_charge_idx
  on public.patient_ledger_entries (invoice_id)
  where entry_type = 'charge';
create unique index patient_ledger_payment_idx
  on public.patient_ledger_entries (payment_id)
  where payment_id is not null;
create index patient_ledger_patient_occurred_idx
  on public.patient_ledger_entries (patient_id, occurred_at desc);

create trigger payment_methods_set_updated_at before update on public.payment_methods
for each row execute function public.set_updated_at();
create trigger cash_desks_set_updated_at before update on public.cash_desks
for each row execute function public.set_updated_at();

alter table public.payment_methods enable row level security;
alter table public.cash_desks enable row level security;
alter table public.cash_shifts enable row level security;
alter table public.payments enable row level security;
alter table public.patient_ledger_entries enable row level security;

create policy payment_methods_select on public.payment_methods
for select to authenticated
using (public.current_user_has_permission(organization_id, 'finance.read'));
create policy cash_desks_select on public.cash_desks
for select to authenticated
using (public.current_user_has_permission(organization_id, 'finance.read'));
create policy cash_shifts_select on public.cash_shifts
for select to authenticated
using (public.current_user_has_permission(organization_id, 'finance.read'));
create policy payments_select on public.payments
for select to authenticated
using (public.current_user_has_permission(organization_id, 'finance.read'));
create policy patient_ledger_select on public.patient_ledger_entries
for select to authenticated
using (public.current_user_has_permission(organization_id, 'finance.read'));

grant select on public.payment_methods, public.cash_desks, public.cash_shifts,
  public.payments, public.patient_ledger_entries to authenticated;

insert into public.payment_methods (organization_id, code, name)
select organization.id, method.code, method.name
from public.organizations organization
cross join (values
  ('cash', 'Наличные'),
  ('card', 'Банковская карта'),
  ('kaspi', 'Kaspi'),
  ('bank_transfer', 'Банковский перевод'),
  ('other', 'Другое')
) as method(code, name)
on conflict (organization_id, code) do nothing;

insert into public.cash_desks (organization_id, branch_id, name, is_active)
select branch.organization_id, branch.id, 'Основная касса', branch.is_active
from public.branches branch
on conflict (organization_id, branch_id, name) do nothing;

create or replace function public.seed_payment_methods_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.payment_methods (organization_id, code, name)
  values
    (new.id, 'cash', 'Наличные'),
    (new.id, 'card', 'Банковская карта'),
    (new.id, 'kaspi', 'Kaspi'),
    (new.id, 'bank_transfer', 'Банковский перевод'),
    (new.id, 'other', 'Другое')
  on conflict (organization_id, code) do nothing;
  return new;
end;
$$;

create trigger organizations_seed_payment_methods
after insert on public.organizations
for each row execute function public.seed_payment_methods_for_organization();

create or replace function public.seed_cash_desk_for_branch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.cash_desks (organization_id, branch_id, name, is_active)
  values (new.organization_id, new.id, 'Основная касса', new.is_active)
  on conflict (organization_id, branch_id, name) do nothing;
  return new;
end;
$$;

create trigger branches_seed_cash_desk
after insert on public.branches
for each row execute function public.seed_cash_desk_for_branch();

create or replace function public.post_invoice_charge_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.total_amount > 0 then
    insert into public.patient_ledger_entries (
      organization_id, patient_id, invoice_id, entry_type,
      debit_amount, credit_amount, description, occurred_at, created_by
    ) values (
      new.organization_id, new.patient_id, new.id, 'charge',
      new.total_amount, 0, 'Счёт ' || new.invoice_number, new.issued_at, new.created_by
    ) on conflict (invoice_id) where entry_type = 'charge' do nothing;
  end if;
  return new;
end;
$$;

create trigger invoices_post_ledger_charge
after insert on public.invoices
for each row execute function public.post_invoice_charge_to_ledger();

insert into public.patient_ledger_entries (
  organization_id, patient_id, invoice_id, entry_type,
  debit_amount, credit_amount, description, occurred_at, created_by
)
select
  invoice.organization_id,
  invoice.patient_id,
  invoice.id,
  'charge',
  invoice.total_amount,
  0,
  'Счёт ' || invoice.invoice_number,
  invoice.issued_at,
  invoice.created_by
from public.invoices invoice
where invoice.total_amount > 0
on conflict (invoice_id) where entry_type = 'charge' do nothing;

create or replace function public.open_cash_shift(
  org_id uuid,
  target_cash_desk_id uuid,
  shift_opening_balance numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_shift_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'cashdesk.manage') then
    raise exception 'Cash desk manage permission required' using errcode = '42501';
  end if;
  if shift_opening_balance is null or shift_opening_balance < 0 then
    raise exception 'Opening balance is invalid';
  end if;

  perform 1 from public.cash_desks cash_desk
  join public.branches branch
    on branch.id = cash_desk.branch_id and branch.organization_id = cash_desk.organization_id
  where cash_desk.id = target_cash_desk_id
    and cash_desk.organization_id = org_id
    and cash_desk.is_active
    and branch.is_active
  for update of cash_desk;
  if not found then
    raise exception 'Active cash desk not found';
  end if;
  if exists (
    select 1 from public.cash_shifts shift
    where shift.organization_id = org_id
      and shift.cash_desk_id = target_cash_desk_id
      and shift.status = 'open'
  ) then
    raise exception 'Cash desk already has an open shift';
  end if;

  insert into public.cash_shifts (
    organization_id, cash_desk_id, opened_by, opening_balance
  ) values (
    org_id, target_cash_desk_id, auth.uid(), shift_opening_balance
  ) returning id into new_shift_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'cash_shift.opened', 'cash_shift', new_shift_id,
    jsonb_build_object('cash_desk_id', target_cash_desk_id, 'opening_balance', shift_opening_balance)
  );

  return new_shift_id;
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
    and payment.status = 'posted'
    and method.code = 'cash';

  expected_balance := shift_opening_balance + cash_payments_total;
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
      'expected_closing_balance', expected_balance,
      'closing_balance', counted_closing_balance,
      'difference_amount', counted_closing_balance - expected_balance
    )
  );
end;
$$;

create or replace function public.record_invoice_payment(
  org_id uuid,
  target_invoice_id uuid,
  target_cash_shift_id uuid,
  target_payment_method_id uuid,
  payment_amount numeric,
  payment_external_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_branch_id uuid;
  invoice_patient_id uuid;
  invoice_status text;
  invoice_debt numeric(14,2);
  resolved_cash_desk_id uuid;
  cash_desk_branch_id uuid;
  shift_status text;
  payment_method_code text;
  next_payment_number bigint;
  generated_receipt_number text;
  new_payment_id uuid;
  remaining_debt numeric(14,2);
begin
  if not public.current_user_has_permission(org_id, 'cashdesk.manage') then
    raise exception 'Cash desk manage permission required' using errcode = '42501';
  end if;
  if payment_amount is null or payment_amount <= 0 then
    raise exception 'Payment amount is invalid';
  end if;
  if payment_external_reference is not null
    and char_length(trim(payment_external_reference)) > 200
  then
    raise exception 'Payment external reference is too long';
  end if;

  select invoice.branch_id, invoice.patient_id, invoice.status, invoice.debt_amount
  into invoice_branch_id, invoice_patient_id, invoice_status, invoice_debt
  from public.invoices invoice
  where invoice.id = target_invoice_id and invoice.organization_id = org_id
  for update;
  if invoice_branch_id is null then
    raise exception 'Invoice not found';
  end if;
  if invoice_status = 'paid' or invoice_debt <= 0 then
    raise exception 'Invoice is already paid';
  end if;
  if payment_amount > invoice_debt then
    raise exception 'Payment amount exceeds invoice debt';
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
  if cash_desk_branch_id <> invoice_branch_id then
    raise exception 'Cash desk and invoice belong to different branches';
  end if;

  select method.code into payment_method_code
  from public.payment_methods method
  where method.id = target_payment_method_id
    and method.organization_id = org_id
    and method.is_active;
  if payment_method_code is null then
    raise exception 'Active payment method not found';
  end if;

  insert into public.payment_number_counters (organization_id, last_value)
  values (org_id, 1)
  on conflict (organization_id)
  do update set last_value = public.payment_number_counters.last_value + 1
  returning last_value into next_payment_number;
  generated_receipt_number := 'PAY-' || lpad(next_payment_number::text, 8, '0');

  insert into public.payments (
    organization_id, branch_id, patient_id, invoice_id,
    cash_desk_id, cash_shift_id, payment_method_id,
    receipt_number, amount, external_reference, created_by
  ) values (
    org_id, invoice_branch_id, invoice_patient_id, target_invoice_id,
    resolved_cash_desk_id, target_cash_shift_id, target_payment_method_id,
    generated_receipt_number, payment_amount,
    nullif(trim(payment_external_reference), ''), auth.uid()
  ) returning id into new_payment_id;

  remaining_debt := invoice_debt - payment_amount;
  update public.invoices
  set paid_amount = paid_amount + payment_amount,
      debt_amount = remaining_debt,
      status = case when remaining_debt = 0 then 'paid' else 'partially_paid' end
  where id = target_invoice_id and organization_id = org_id;

  insert into public.patient_ledger_entries (
    organization_id, patient_id, invoice_id, payment_id, entry_type,
    debit_amount, credit_amount, description, occurred_at, created_by
  ) values (
    org_id, invoice_patient_id, target_invoice_id, new_payment_id, 'payment',
    0, payment_amount, 'Оплата ' || generated_receipt_number, now(), auth.uid()
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'payment.posted', 'payment', new_payment_id,
    jsonb_build_object(
      'receipt_number', generated_receipt_number,
      'invoice_id', target_invoice_id,
      'patient_id', invoice_patient_id,
      'cash_shift_id', target_cash_shift_id,
      'payment_method', payment_method_code,
      'amount', payment_amount,
      'remaining_debt', remaining_debt
    )
  );

  return new_payment_id;
end;
$$;

create or replace function public.list_cash_desks(org_id uuid)
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
    case when shift.id is null then null else shift.opening_balance + coalesce(cash_total.amount, 0) end
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
      and payment.status = 'posted'
      and method.code = 'cash'
  ) cash_total on true
  where cash_desk.organization_id = org_id
    and public.current_user_has_permission(org_id, 'finance.read')
  order by branch.name, cash_desk.name;
$$;

create or replace function public.list_payment_methods(org_id uuid)
returns table (
  id uuid,
  code text,
  name text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select method.id, method.code, method.name, method.is_active
  from public.payment_methods method
  where method.organization_id = org_id
    and method.is_active
    and public.current_user_has_permission(org_id, 'finance.read')
  order by case method.code
    when 'cash' then 1 when 'card' then 2 when 'kaspi' then 3
    when 'bank_transfer' then 4 else 5 end;
$$;

create or replace function public.list_payments(
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
  cash_desk_name text,
  branch_name text,
  payment_method_code text,
  payment_method_name text,
  amount numeric,
  paid_at timestamptz,
  status text,
  external_reference text
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
    cash_desk.name,
    branch.name,
    method.code,
    method.name,
    payment.amount,
    payment.paid_at,
    payment.status,
    payment.external_reference
  from public.payments payment
  join public.patients patient
    on patient.id = payment.patient_id and patient.organization_id = payment.organization_id
  left join public.invoices invoice
    on invoice.id = payment.invoice_id and invoice.organization_id = payment.organization_id
  join public.cash_desks cash_desk
    on cash_desk.id = payment.cash_desk_id and cash_desk.organization_id = payment.organization_id
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

create or replace function public.list_patient_ledger(
  org_id uuid,
  target_patient_id uuid,
  result_limit integer default 200
)
returns table (
  id uuid,
  invoice_id uuid,
  invoice_number text,
  payment_id uuid,
  entry_type text,
  debit_amount numeric,
  credit_amount numeric,
  description text,
  occurred_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    entry.id,
    entry.invoice_id,
    invoice.invoice_number,
    entry.payment_id,
    entry.entry_type,
    entry.debit_amount,
    entry.credit_amount,
    entry.description,
    entry.occurred_at
  from public.patient_ledger_entries entry
  left join public.invoices invoice
    on invoice.id = entry.invoice_id and invoice.organization_id = entry.organization_id
  where entry.organization_id = org_id
    and entry.patient_id = target_patient_id
    and public.current_user_has_permission(org_id, 'finance.read')
  order by entry.occurred_at desc, entry.created_at desc
  limit least(greatest(result_limit, 1), 500);
$$;

revoke all on function public.open_cash_shift(uuid, uuid, numeric) from public;
revoke all on function public.close_cash_shift(uuid, uuid, numeric) from public;
revoke all on function public.record_invoice_payment(uuid, uuid, uuid, uuid, numeric, text) from public;
revoke all on function public.list_cash_desks(uuid) from public;
revoke all on function public.list_payment_methods(uuid) from public;
revoke all on function public.list_payments(uuid, uuid, integer) from public;
revoke all on function public.list_patient_ledger(uuid, uuid, integer) from public;

grant execute on function public.open_cash_shift(uuid, uuid, numeric) to authenticated;
grant execute on function public.close_cash_shift(uuid, uuid, numeric) to authenticated;
grant execute on function public.record_invoice_payment(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.list_cash_desks(uuid) to authenticated;
grant execute on function public.list_payment_methods(uuid) to authenticated;
grant execute on function public.list_payments(uuid, uuid, integer) to authenticated;
grant execute on function public.list_patient_ledger(uuid, uuid, integer) to authenticated;
