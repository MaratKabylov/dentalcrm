begin;

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 120),
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  value numeric(14,2) not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discounts_value_check check (
    (discount_type = 'percentage' and value > 0 and value <= 100)
    or (discount_type = 'fixed' and value > 0)
  ),
  unique (organization_id, id)
);

create unique index discounts_organization_name_idx
  on public.discounts (organization_id, lower(name));
create index discounts_organization_active_idx
  on public.discounts (organization_id, is_active, name);

create table public.discount_role_limits (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  max_discount_percent numeric(5,2) not null
    check (max_discount_percent >= 0 and max_discount_percent <= 100),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, role_id)
);

create table public.discount_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null,
  patient_id uuid not null,
  discount_id uuid not null,
  discount_name text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(14,2) not null,
  amount_before numeric(14,2) not null check (amount_before > 0),
  discount_amount numeric(14,2) not null check (discount_amount > 0),
  amount_after numeric(14,2) not null check (amount_after >= 0),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  applied_by uuid not null references public.profiles(id) on delete restrict,
  applied_at timestamptz not null default now(),
  constraint discount_applications_invoice_fkey foreign key (organization_id, invoice_id)
    references public.invoices(organization_id, id) on delete restrict,
  constraint discount_applications_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint discount_applications_discount_fkey foreign key (organization_id, discount_id)
    references public.discounts(organization_id, id) on delete restrict,
  constraint discount_applications_amounts_check check (
    amount_after = amount_before - discount_amount
  ),
  unique (organization_id, id)
);

create index discount_applications_invoice_applied_idx
  on public.discount_applications (invoice_id, applied_at desc);
create index discount_applications_patient_applied_idx
  on public.discount_applications (patient_id, applied_at desc);

create trigger discounts_set_updated_at
before update on public.discounts
for each row execute function public.set_updated_at();

create or replace function public.enforce_discount_role_limit_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_role_organization_id uuid;
  target_role_is_system boolean;
begin
  select role.organization_id, role.is_system
  into target_role_organization_id, target_role_is_system
  from public.roles role
  where role.id = new.role_id;

  if target_role_is_system is null then
    raise exception 'Role not found';
  end if;
  if not target_role_is_system
    and target_role_organization_id is distinct from new.organization_id
  then
    raise exception 'Role belongs to a different organization';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger discount_role_limits_scope_guard
before insert or update on public.discount_role_limits
for each row execute function public.enforce_discount_role_limit_scope();

alter table public.patient_ledger_entries
  drop constraint patient_ledger_reference_check;

alter table public.patient_ledger_entries
  add column discount_application_id uuid,
  add constraint patient_ledger_discount_application_fkey
    foreign key (organization_id, discount_application_id)
    references public.discount_applications(organization_id, id) on delete restrict,
  add constraint patient_ledger_reference_check check (
    (
      entry_type = 'charge'
      and invoice_id is not null
      and payment_id is null
      and payment_reversal_id is null
      and payment_refund_id is null
      and discount_application_id is null
    )
    or (
      entry_type = 'payment'
      and invoice_id is not null
      and payment_id is not null
      and payment_reversal_id is null
      and payment_refund_id is null
      and discount_application_id is null
    )
    or (
      entry_type = 'reversal'
      and invoice_id is not null
      and payment_id is null
      and payment_reversal_id is not null
      and payment_refund_id is null
      and discount_application_id is null
    )
    or (
      entry_type = 'refund'
      and invoice_id is not null
      and payment_id is null
      and payment_reversal_id is null
      and payment_refund_id is not null
      and discount_application_id is null
    )
    or (
      entry_type = 'adjustment'
      and payment_id is null
      and payment_reversal_id is null
      and payment_refund_id is null
    )
  );

create unique index patient_ledger_discount_application_idx
  on public.patient_ledger_entries (discount_application_id)
  where discount_application_id is not null;

alter table public.discounts enable row level security;
alter table public.discount_role_limits enable row level security;
alter table public.discount_applications enable row level security;

create policy discounts_select on public.discounts
for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  or public.current_user_has_permission(organization_id, 'settings.manage')
);

create policy discount_role_limits_select on public.discount_role_limits
for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  or public.current_user_has_permission(organization_id, 'settings.manage')
);

create policy discount_applications_select on public.discount_applications
for select to authenticated
using (public.current_user_has_permission(organization_id, 'finance.read'));

grant select on public.discounts, public.discount_role_limits,
  public.discount_applications to authenticated;

insert into public.discounts (
  organization_id, name, discount_type, value, created_by
)
select organization.id, seed.name, 'percentage', seed.value, null
from public.organizations organization
cross join (values
  ('Лояльность', 5::numeric),
  ('Социальная скидка', 10::numeric)
) as seed(name, value)
on conflict do nothing;

insert into public.discount_role_limits (
  organization_id, role_id, max_discount_percent
)
select organization.id, role.id, seed.max_percent
from public.organizations organization
join (values
  ('owner', 100::numeric),
  ('accountant', 20::numeric),
  ('cashier', 10::numeric)
) as seed(role_code, max_percent) on true
join public.roles role
  on role.code = seed.role_code
  and role.is_system
  and role.organization_id is null
on conflict (organization_id, role_id) do nothing;

create or replace function public.seed_discounts_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.discounts (
    organization_id, name, discount_type, value, created_by
  ) values
    (new.id, 'Лояльность', 'percentage', 5, auth.uid()),
    (new.id, 'Социальная скидка', 'percentage', 10, auth.uid())
  on conflict do nothing;

  insert into public.discount_role_limits (
    organization_id, role_id, max_discount_percent, updated_by
  )
  select new.id, role.id, seed.max_percent, auth.uid()
  from (values
    ('owner', 100::numeric),
    ('accountant', 20::numeric),
    ('cashier', 10::numeric)
  ) as seed(role_code, max_percent)
  join public.roles role
    on role.code = seed.role_code
    and role.is_system
    and role.organization_id is null
  on conflict (organization_id, role_id) do nothing;

  return new;
end;
$$;

create trigger organizations_seed_discounts
after insert on public.organizations
for each row execute function public.seed_discounts_for_organization();

create or replace function public.create_discount_definition(
  org_id uuid,
  discount_name text,
  new_discount_type text,
  discount_value numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_discount_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'settings.manage') then
    raise exception 'Settings manage permission required' using errcode = '42501';
  end if;
  if discount_name is null or char_length(trim(discount_name)) not between 2 and 120 then
    raise exception 'Discount name is invalid';
  end if;
  if new_discount_type not in ('percentage', 'fixed') then
    raise exception 'Discount type is invalid';
  end if;
  if discount_value is null or discount_value <= 0
    or round(discount_value, 2) <> discount_value
    or (new_discount_type = 'percentage' and discount_value > 100)
  then
    raise exception 'Discount value is invalid';
  end if;

  insert into public.discounts (
    organization_id, name, discount_type, value, created_by
  ) values (
    org_id, trim(discount_name), new_discount_type, discount_value, auth.uid()
  ) returning id into new_discount_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'discount.created', 'discount', new_discount_id,
    jsonb_build_object(
      'name', trim(discount_name),
      'discount_type', new_discount_type,
      'value', discount_value,
      'is_active', true
    )
  );

  return new_discount_id;
end;
$$;

create or replace function public.set_discount_definition_active(
  org_id uuid,
  target_discount_id uuid,
  new_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_is_active boolean;
begin
  if not public.current_user_has_permission(org_id, 'settings.manage') then
    raise exception 'Settings manage permission required' using errcode = '42501';
  end if;

  select discount.is_active into previous_is_active
  from public.discounts discount
  where discount.id = target_discount_id and discount.organization_id = org_id
  for update;
  if previous_is_active is null then
    raise exception 'Discount not found';
  end if;

  update public.discounts
  set is_active = new_is_active
  where id = target_discount_id and organization_id = org_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    org_id, auth.uid(), 'discount.status_changed', 'discount', target_discount_id,
    jsonb_build_object('is_active', previous_is_active),
    jsonb_build_object('is_active', new_is_active)
  );
end;
$$;

create or replace function public.set_discount_role_limit(
  org_id uuid,
  target_role_id uuid,
  new_max_discount_percent numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  role_code text;
  role_has_finance_permission boolean;
  previous_limit numeric;
begin
  if not public.current_user_has_permission(org_id, 'settings.manage') then
    raise exception 'Settings manage permission required' using errcode = '42501';
  end if;
  if new_max_discount_percent is null
    or new_max_discount_percent < 0
    or new_max_discount_percent > 100
    or round(new_max_discount_percent, 2) <> new_max_discount_percent
  then
    raise exception 'Discount role limit is invalid';
  end if;

  select
    role.code,
    exists (
      select 1
      from public.role_permissions role_permission
      join public.permissions permission on permission.id = role_permission.permission_id
      where role_permission.role_id = role.id and permission.code = 'finance.manage'
    )
  into role_code, role_has_finance_permission
  from public.roles role
  where role.id = target_role_id
    and (role.is_system or role.organization_id = org_id);
  if role_code is null or not role_has_finance_permission then
    raise exception 'Finance management role not found';
  end if;

  select role_limit.max_discount_percent into previous_limit
  from public.discount_role_limits role_limit
  where role_limit.organization_id = org_id and role_limit.role_id = target_role_id;

  insert into public.discount_role_limits (
    organization_id, role_id, max_discount_percent, updated_by
  ) values (
    org_id, target_role_id, new_max_discount_percent, auth.uid()
  )
  on conflict (organization_id, role_id)
  do update set
    max_discount_percent = excluded.max_discount_percent,
    updated_by = excluded.updated_by;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    org_id, auth.uid(), 'discount.role_limit_changed', 'role', target_role_id,
    jsonb_build_object('role_code', role_code, 'max_discount_percent', previous_limit),
    jsonb_build_object('role_code', role_code, 'max_discount_percent', new_max_discount_percent)
  );
end;
$$;

create or replace function public.apply_invoice_discount(
  org_id uuid,
  target_invoice_id uuid,
  target_discount_id uuid,
  application_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_patient_id uuid;
  invoice_number text;
  invoice_subtotal numeric(14,2);
  invoice_total numeric(14,2);
  invoice_paid numeric(14,2);
  invoice_debt numeric(14,2);
  definition_name text;
  definition_type text;
  definition_value numeric(14,2);
  definition_is_active boolean;
  effective_limit numeric(5,2);
  previous_applied_discount numeric(14,2);
  maximum_allowed_discount numeric(14,2);
  calculated_discount numeric(14,2);
  new_total numeric(14,2);
  new_debt numeric(14,2);
  new_application_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'finance.manage') then
    raise exception 'Finance manage permission required' using errcode = '42501';
  end if;
  if application_reason is null or char_length(trim(application_reason)) not between 3 and 500 then
    raise exception 'Discount reason is invalid';
  end if;

  select
    invoice.patient_id,
    invoice.invoice_number,
    invoice.subtotal,
    invoice.total_amount,
    invoice.paid_amount,
    invoice.debt_amount
  into
    invoice_patient_id,
    invoice_number,
    invoice_subtotal,
    invoice_total,
    invoice_paid,
    invoice_debt
  from public.invoices invoice
  where invoice.id = target_invoice_id and invoice.organization_id = org_id
  for update;
  if invoice_patient_id is null then
    raise exception 'Invoice not found';
  end if;
  if invoice_debt <= 0 then
    raise exception 'A discount cannot be applied to an invoice without debt';
  end if;

  select discount.name, discount.discount_type, discount.value, discount.is_active
  into definition_name, definition_type, definition_value, definition_is_active
  from public.discounts discount
  where discount.id = target_discount_id and discount.organization_id = org_id
  for share;
  if definition_name is null or not definition_is_active then
    raise exception 'Active discount not found';
  end if;

  select coalesce(max(role_limit.max_discount_percent), 0)
  into effective_limit
  from public.organization_members member
  join public.member_roles member_role
    on member_role.organization_member_id = member.id
  join public.discount_role_limits role_limit
    on role_limit.role_id = member_role.role_id
    and role_limit.organization_id = member.organization_id
  where member.organization_id = org_id
    and member.user_id = auth.uid()
    and member.status = 'active';

  if effective_limit <= 0 then
    raise exception 'User role does not allow invoice discounts' using errcode = '42501';
  end if;

  calculated_discount := case
    when definition_type = 'percentage'
      then round(invoice_subtotal * definition_value / 100, 2)
    else definition_value
  end;
  if calculated_discount <= 0 then
    raise exception 'Calculated discount is zero';
  end if;

  select coalesce(sum(application.discount_amount), 0)
  into previous_applied_discount
  from public.discount_applications application
  where application.organization_id = org_id
    and application.invoice_id = target_invoice_id;

  maximum_allowed_discount := round(invoice_subtotal * effective_limit / 100, 2);
  if previous_applied_discount + calculated_discount > maximum_allowed_discount then
    raise exception 'Discount exceeds user role limit';
  end if;
  if calculated_discount > invoice_debt then
    raise exception 'Discount exceeds unpaid invoice balance';
  end if;

  new_total := invoice_total - calculated_discount;
  new_debt := invoice_debt - calculated_discount;

  insert into public.discount_applications (
    organization_id, invoice_id, patient_id, discount_id,
    discount_name, discount_type, discount_value,
    amount_before, discount_amount, amount_after, reason, applied_by
  ) values (
    org_id, target_invoice_id, invoice_patient_id, target_discount_id,
    definition_name, definition_type, definition_value,
    invoice_total, calculated_discount, new_total, trim(application_reason), auth.uid()
  ) returning id into new_application_id;

  update public.invoices
  set discount_amount = discount_amount + calculated_discount,
      total_amount = new_total,
      debt_amount = new_debt,
      status = case
        when new_debt = 0 then 'paid'
        when invoice_paid > 0 then 'partially_paid'
        else 'issued'
      end
  where id = target_invoice_id and organization_id = org_id;

  insert into public.patient_ledger_entries (
    organization_id, patient_id, invoice_id, discount_application_id,
    entry_type, debit_amount, credit_amount, description, occurred_at, created_by
  ) values (
    org_id, invoice_patient_id, target_invoice_id, new_application_id,
    'adjustment', 0, calculated_discount,
    'Скидка по счёту ' || invoice_number || ': ' || definition_name,
    now(), auth.uid()
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    org_id, auth.uid(), 'invoice.discount_applied', 'invoice', target_invoice_id,
    jsonb_build_object(
      'total_amount', invoice_total,
      'debt_amount', invoice_debt
    ),
    jsonb_build_object(
      'discount_application_id', new_application_id,
      'discount_id', target_discount_id,
      'discount_name', definition_name,
      'discount_type', definition_type,
      'discount_value', definition_value,
      'discount_amount', calculated_discount,
      'reason', trim(application_reason),
      'role_limit_percent', effective_limit,
      'total_amount', new_total,
      'debt_amount', new_debt
    )
  );

  return new_application_id;
end;
$$;

create or replace function public.list_discounts(
  org_id uuid,
  include_inactive boolean default false
)
returns table (
  id uuid,
  name text,
  discount_type text,
  value numeric,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    discount.id,
    discount.name,
    discount.discount_type,
    discount.value,
    discount.is_active,
    discount.created_at
  from public.discounts discount
  where discount.organization_id = org_id
    and (include_inactive or discount.is_active)
    and (
      public.current_user_has_permission(org_id, 'finance.read')
      or public.current_user_has_permission(org_id, 'settings.manage')
    )
  order by discount.is_active desc, discount.name;
$$;

create or replace function public.get_current_discount_limit(org_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(role_limit.max_discount_percent), 0)
  from public.organization_members member
  join public.member_roles member_role
    on member_role.organization_member_id = member.id
  join public.discount_role_limits role_limit
    on role_limit.role_id = member_role.role_id
    and role_limit.organization_id = member.organization_id
  where member.organization_id = org_id
    and member.user_id = auth.uid()
    and member.status = 'active'
    and public.current_user_has_permission(org_id, 'finance.read');
$$;

create or replace function public.list_discount_role_limits(org_id uuid)
returns table (
  role_id uuid,
  role_code text,
  role_name text,
  max_discount_percent numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    role.id,
    role.code,
    role.name,
    coalesce(role_limit.max_discount_percent, 0)
  from public.roles role
  join public.role_permissions role_permission on role_permission.role_id = role.id
  join public.permissions permission
    on permission.id = role_permission.permission_id
    and permission.code = 'finance.manage'
  left join public.discount_role_limits role_limit
    on role_limit.role_id = role.id
    and role_limit.organization_id = org_id
  where (role.is_system or role.organization_id = org_id)
    and (
      public.current_user_has_permission(org_id, 'finance.read')
      or public.current_user_has_permission(org_id, 'settings.manage')
    )
  order by role.is_system desc, role.name;
$$;

create or replace function public.list_invoice_discount_applications(
  org_id uuid,
  target_invoice_id uuid
)
returns table (
  id uuid,
  discount_id uuid,
  discount_name text,
  discount_type text,
  discount_value numeric,
  amount_before numeric,
  discount_amount numeric,
  amount_after numeric,
  reason text,
  applied_by_name text,
  applied_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    application.id,
    application.discount_id,
    application.discount_name,
    application.discount_type,
    application.discount_value,
    application.amount_before,
    application.discount_amount,
    application.amount_after,
    application.reason,
    profile.full_name,
    application.applied_at
  from public.discount_applications application
  join public.profiles profile on profile.id = application.applied_by
  where application.organization_id = org_id
    and application.invoice_id = target_invoice_id
    and public.current_user_has_permission(org_id, 'finance.read')
  order by application.applied_at desc;
$$;

revoke all on function public.create_discount_definition(uuid, text, text, numeric) from public;
revoke all on function public.set_discount_definition_active(uuid, uuid, boolean) from public;
revoke all on function public.set_discount_role_limit(uuid, uuid, numeric) from public;
revoke all on function public.apply_invoice_discount(uuid, uuid, uuid, text) from public;
revoke all on function public.list_discounts(uuid, boolean) from public;
revoke all on function public.get_current_discount_limit(uuid) from public;
revoke all on function public.list_discount_role_limits(uuid) from public;
revoke all on function public.list_invoice_discount_applications(uuid, uuid) from public;

grant execute on function public.create_discount_definition(uuid, text, text, numeric) to authenticated;
grant execute on function public.set_discount_definition_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_discount_role_limit(uuid, uuid, numeric) to authenticated;
grant execute on function public.apply_invoice_discount(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.list_discounts(uuid, boolean) to authenticated;
grant execute on function public.get_current_discount_limit(uuid) to authenticated;
grant execute on function public.list_discount_role_limits(uuid) to authenticated;
grant execute on function public.list_invoice_discount_applications(uuid, uuid) to authenticated;

commit;
