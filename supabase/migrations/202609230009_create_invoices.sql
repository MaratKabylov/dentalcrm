create table public.invoice_number_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0)
);

alter table public.invoice_number_counters enable row level security;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  encounter_id uuid,
  invoice_number text not null check (char_length(invoice_number) between 5 and 40),
  status text not null check (status in ('issued', 'partially_paid', 'paid')),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  debt_amount numeric(14,2) not null check (debt_amount >= 0),
  issued_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint invoices_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint invoices_encounter_fkey foreign key (organization_id, encounter_id)
    references public.clinical_encounters(organization_id, id) on delete restrict,
  constraint invoices_totals_check check (
    discount_amount <= subtotal
    and total_amount = subtotal - discount_amount
    and paid_amount <= total_amount
    and debt_amount = total_amount - paid_amount
  ),
  constraint invoices_status_amounts_check check (
    (status = 'issued' and paid_amount = 0 and debt_amount > 0)
    or (status = 'partially_paid' and paid_amount > 0 and debt_amount > 0)
    or (status = 'paid' and debt_amount = 0)
  ),
  unique (organization_id, id),
  unique (organization_id, invoice_number)
);

create unique index invoices_encounter_unique_idx
  on public.invoices (organization_id, encounter_id)
  where encounter_id is not null;
create index invoices_patient_issued_idx
  on public.invoices (patient_id, issued_at desc);
create index invoices_branch_status_idx
  on public.invoices (branch_id, status, issued_at desc);
create index invoices_debt_idx
  on public.invoices (organization_id, debt_amount, issued_at desc)
  where debt_amount > 0;

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null,
  service_id uuid,
  performed_service_id uuid,
  description text not null check (char_length(trim(description)) between 2 and 500),
  quantity numeric(10,2) not null check (quantity > 0 and quantity <= 100),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  constraint invoice_items_invoice_fkey foreign key (organization_id, invoice_id)
    references public.invoices(organization_id, id) on delete restrict,
  constraint invoice_items_service_fkey foreign key (organization_id, service_id)
    references public.services(organization_id, id) on delete restrict,
  constraint invoice_items_performed_service_fkey foreign key (organization_id, performed_service_id)
    references public.performed_services(organization_id, id) on delete restrict,
  constraint invoice_items_amount_calculation_check check (
    amount = round((quantity * unit_price) - discount_amount, 2)
    and discount_amount <= round(quantity * unit_price, 2)
  ),
  unique (organization_id, id),
  unique (performed_service_id)
);

create index invoice_items_invoice_idx on public.invoice_items (invoice_id, created_at);

create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy invoices_select on public.invoices
for select to authenticated
using (public.current_user_has_permission(organization_id, 'finance.read'));

create policy invoice_items_select on public.invoice_items
for select to authenticated
using (public.current_user_has_permission(organization_id, 'finance.read'));

grant select on public.invoices, public.invoice_items to authenticated;

create or replace function public.create_invoice_from_encounter(
  org_id uuid,
  target_encounter_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  encounter_status text;
  invoice_branch_id uuid;
  invoice_patient_id uuid;
  next_invoice_number bigint;
  generated_invoice_number text;
  invoice_subtotal numeric(14,2);
  invoice_discount numeric(14,2);
  invoice_total numeric(14,2);
  new_invoice_id uuid;
  invoice_item_count integer;
begin
  if not public.current_user_has_permission(org_id, 'finance.manage') then
    raise exception 'Finance manage permission required' using errcode = '42501';
  end if;

  select encounter.status, encounter.branch_id, encounter.patient_id
  into encounter_status, invoice_branch_id, invoice_patient_id
  from public.clinical_encounters encounter
  where encounter.id = target_encounter_id
    and encounter.organization_id = org_id
  for update;

  if encounter_status is null then
    raise exception 'Clinical encounter not found';
  end if;
  if encounter_status <> 'closed' then
    raise exception 'Invoice can only be issued for a closed encounter';
  end if;
  if exists (
    select 1 from public.invoices invoice
    where invoice.organization_id = org_id
      and invoice.encounter_id = target_encounter_id
  ) then
    raise exception 'Invoice for this encounter already exists';
  end if;

  perform performed.id
  from public.performed_services performed
  where performed.organization_id = org_id
    and performed.encounter_id = target_encounter_id
    and performed.voided_at is null
  for update;
  if not found then
    raise exception 'Encounter has no billable performed services';
  end if;

  if exists (
    select 1
    from public.performed_services performed
    join public.invoice_items item
      on item.performed_service_id = performed.id
      and item.organization_id = performed.organization_id
    where performed.organization_id = org_id
      and performed.encounter_id = target_encounter_id
      and performed.voided_at is null
  ) then
    raise exception 'One or more performed services have already been invoiced';
  end if;

  select
    sum(round(performed.quantity * performed.unit_price, 2)),
    sum(performed.discount_amount),
    sum(performed.final_amount),
    count(*)
  into invoice_subtotal, invoice_discount, invoice_total, invoice_item_count
  from public.performed_services performed
  where performed.organization_id = org_id
    and performed.encounter_id = target_encounter_id
    and performed.voided_at is null;

  insert into public.invoice_number_counters (organization_id, last_value)
  values (org_id, 1)
  on conflict (organization_id)
  do update set last_value = public.invoice_number_counters.last_value + 1
  returning last_value into next_invoice_number;

  generated_invoice_number := 'INV-' || lpad(next_invoice_number::text, 8, '0');

  insert into public.invoices (
    organization_id, branch_id, patient_id, encounter_id, invoice_number,
    status, subtotal, discount_amount, total_amount, paid_amount, debt_amount,
    created_by
  ) values (
    org_id, invoice_branch_id, invoice_patient_id, target_encounter_id,
    generated_invoice_number,
    case when invoice_total = 0 then 'paid' else 'issued' end,
    invoice_subtotal, invoice_discount, invoice_total, 0, invoice_total,
    auth.uid()
  ) returning id into new_invoice_id;

  insert into public.invoice_items (
    organization_id, invoice_id, service_id, performed_service_id,
    description, quantity, unit_price, discount_amount, amount
  )
  select
    org_id,
    new_invoice_id,
    performed.service_id,
    performed.id,
    performed.service_code_snapshot || ' — ' || performed.service_name_snapshot
      || case when performed.tooth_code is not null then ' · зуб ' || performed.tooth_code else '' end,
    performed.quantity,
    performed.unit_price,
    performed.discount_amount,
    performed.final_amount
  from public.performed_services performed
  where performed.organization_id = org_id
    and performed.encounter_id = target_encounter_id
    and performed.voided_at is null
  order by performed.performed_at, performed.created_at;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'invoice.issued', 'invoice', new_invoice_id,
    jsonb_build_object(
      'invoice_number', generated_invoice_number,
      'patient_id', invoice_patient_id,
      'encounter_id', target_encounter_id,
      'item_count', invoice_item_count,
      'subtotal', invoice_subtotal,
      'discount_amount', invoice_discount,
      'total_amount', invoice_total
    )
  );

  return new_invoice_id;
end;
$$;

create or replace function public.list_billable_encounters(org_id uuid)
returns table (
  encounter_id uuid,
  patient_id uuid,
  patient_name text,
  patient_external_number text,
  doctor_name text,
  branch_name text,
  closed_at timestamptz,
  procedure_count bigint,
  total_amount numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    encounter.id,
    encounter.patient_id,
    trim(concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name)),
    patient.external_number,
    employee.full_name,
    branch.name,
    encounter.closed_at,
    count(performed.id),
    sum(performed.final_amount)
  from public.clinical_encounters encounter
  join public.patients patient
    on patient.id = encounter.patient_id and patient.organization_id = encounter.organization_id
  join public.doctors doctor
    on doctor.id = encounter.doctor_id and doctor.organization_id = encounter.organization_id
  join public.employees employee
    on employee.id = doctor.employee_id and employee.organization_id = encounter.organization_id
  join public.branches branch
    on branch.id = encounter.branch_id and branch.organization_id = encounter.organization_id
  join public.performed_services performed
    on performed.encounter_id = encounter.id
    and performed.organization_id = encounter.organization_id
    and performed.voided_at is null
  left join public.invoices invoice
    on invoice.encounter_id = encounter.id
    and invoice.organization_id = encounter.organization_id
  where encounter.organization_id = org_id
    and encounter.status = 'closed'
    and invoice.id is null
    and public.current_user_has_permission(org_id, 'finance.read')
  group by encounter.id, patient.id, employee.id, branch.id
  order by encounter.closed_at;
$$;

create or replace function public.list_invoices(
  org_id uuid,
  target_patient_id uuid default null,
  result_limit integer default 100
)
returns table (
  id uuid,
  invoice_number text,
  patient_id uuid,
  patient_name text,
  patient_external_number text,
  branch_name text,
  encounter_id uuid,
  status text,
  total_amount numeric,
  paid_amount numeric,
  debt_amount numeric,
  issued_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    invoice.id,
    invoice.invoice_number,
    invoice.patient_id,
    trim(concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name)),
    patient.external_number,
    branch.name,
    invoice.encounter_id,
    invoice.status,
    invoice.total_amount,
    invoice.paid_amount,
    invoice.debt_amount,
    invoice.issued_at
  from public.invoices invoice
  join public.patients patient
    on patient.id = invoice.patient_id and patient.organization_id = invoice.organization_id
  join public.branches branch
    on branch.id = invoice.branch_id and branch.organization_id = invoice.organization_id
  where invoice.organization_id = org_id
    and (target_patient_id is null or invoice.patient_id = target_patient_id)
    and public.current_user_has_permission(org_id, 'finance.read')
  order by invoice.issued_at desc
  limit least(greatest(result_limit, 1), 500);
$$;

create or replace function public.get_invoice(org_id uuid, target_invoice_id uuid)
returns table (
  id uuid,
  invoice_number text,
  branch_id uuid,
  branch_name text,
  patient_id uuid,
  patient_name text,
  patient_external_number text,
  encounter_id uuid,
  status text,
  subtotal numeric,
  discount_amount numeric,
  total_amount numeric,
  paid_amount numeric,
  debt_amount numeric,
  issued_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    invoice.id,
    invoice.invoice_number,
    invoice.branch_id,
    branch.name,
    invoice.patient_id,
    trim(concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name)),
    patient.external_number,
    invoice.encounter_id,
    invoice.status,
    invoice.subtotal,
    invoice.discount_amount,
    invoice.total_amount,
    invoice.paid_amount,
    invoice.debt_amount,
    invoice.issued_at
  from public.invoices invoice
  join public.patients patient
    on patient.id = invoice.patient_id and patient.organization_id = invoice.organization_id
  join public.branches branch
    on branch.id = invoice.branch_id and branch.organization_id = invoice.organization_id
  where invoice.organization_id = org_id
    and invoice.id = target_invoice_id
    and public.current_user_has_permission(org_id, 'finance.read');
$$;

create or replace function public.list_invoice_items(org_id uuid, target_invoice_id uuid)
returns table (
  id uuid,
  service_id uuid,
  performed_service_id uuid,
  description text,
  quantity numeric,
  unit_price numeric,
  discount_amount numeric,
  amount numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    item.id,
    item.service_id,
    item.performed_service_id,
    item.description,
    item.quantity,
    item.unit_price,
    item.discount_amount,
    item.amount
  from public.invoice_items item
  where item.organization_id = org_id
    and item.invoice_id = target_invoice_id
    and public.current_user_has_permission(org_id, 'finance.read')
  order by item.created_at, item.id;
$$;

create or replace function public.get_invoice_summary(
  org_id uuid,
  target_patient_id uuid default null
)
returns table (
  invoice_count bigint,
  total_amount numeric,
  debt_amount numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(invoice.id),
    coalesce(sum(invoice.total_amount), 0),
    coalesce(sum(invoice.debt_amount), 0)
  from public.invoices invoice
  where invoice.organization_id = org_id
    and (target_patient_id is null or invoice.patient_id = target_patient_id)
    and public.current_user_has_permission(org_id, 'finance.read');
$$;

revoke all on function public.create_invoice_from_encounter(uuid, uuid) from public;
revoke all on function public.list_billable_encounters(uuid) from public;
revoke all on function public.list_invoices(uuid, uuid, integer) from public;
revoke all on function public.get_invoice(uuid, uuid) from public;
revoke all on function public.list_invoice_items(uuid, uuid) from public;
revoke all on function public.get_invoice_summary(uuid, uuid) from public;

grant execute on function public.create_invoice_from_encounter(uuid, uuid) to authenticated;
grant execute on function public.list_billable_encounters(uuid) to authenticated;
grant execute on function public.list_invoices(uuid, uuid, integer) to authenticated;
grant execute on function public.get_invoice(uuid, uuid) to authenticated;
grant execute on function public.list_invoice_items(uuid, uuid) to authenticated;
grant execute on function public.get_invoice_summary(uuid, uuid) to authenticated;
