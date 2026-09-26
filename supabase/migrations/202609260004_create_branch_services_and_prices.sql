begin;

alter table public.services
  add column scope text not null default 'organization'
    constraint services_scope_value_check
    check (scope in ('organization', 'branch')),
  add column branch_id uuid;

alter table public.services
  add constraint services_scope_check check (
    (scope = 'organization' and branch_id is null)
    or (scope = 'branch' and branch_id is not null)
  ),
  add constraint services_branch_fkey
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict;

create index services_branch_scope_idx
  on public.services (organization_id, branch_id, scope, is_active);

create table public.service_branch_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null,
  branch_id uuid not null,
  is_available boolean not null default true,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 5 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service_id, branch_id),
  constraint service_branch_settings_service_fkey
    foreign key (organization_id, service_id)
    references public.services(organization_id, id) on delete cascade,
  constraint service_branch_settings_branch_fkey
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict
);

create index service_branch_settings_branch_idx
  on public.service_branch_settings (organization_id, branch_id, is_available);
create trigger service_branch_settings_set_updated_at
before update on public.service_branch_settings
for each row execute function public.set_updated_at();

insert into public.service_branch_settings (
  organization_id, service_id, branch_id, is_available, duration_minutes
)
select service.organization_id, service.id, service.branch_id, service.is_active, service.duration_minutes
from public.services service
where service.scope = 'branch'
on conflict do nothing;

create table public.service_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null,
  branch_id uuid,
  price numeric(14,2) not null check (price >= 0),
  valid_from date not null,
  valid_to date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint service_prices_service_fkey
    foreign key (organization_id, service_id)
    references public.services(organization_id, id) on delete restrict,
  constraint service_prices_branch_fkey
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint service_prices_dates_check check (valid_to is null or valid_to >= valid_from),
  unique (organization_id, id)
);

create index service_prices_lookup_idx
  on public.service_prices (organization_id, service_id, branch_id, valid_from desc, valid_to);

insert into public.service_prices (
  organization_id, service_id, branch_id, price, valid_from, created_by
)
select service.organization_id, service.id, service.branch_id,
  service.base_price, current_date, null
from public.services service;

create or replace function public.enforce_service_price_period()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.service_prices price
    where price.organization_id = new.organization_id
      and price.service_id = new.service_id
      and price.branch_id is not distinct from new.branch_id
      and price.id <> new.id
      and daterange(
        price.valid_from,
        coalesce(price.valid_to + 1, 'infinity'::date),
        '[)'
      ) && daterange(
        new.valid_from,
        coalesce(new.valid_to + 1, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'Service price period overlaps an existing price';
  end if;
  return new;
end;
$$;

create trigger service_prices_period_guard
before insert or update of organization_id, service_id, branch_id, valid_from, valid_to
on public.service_prices
for each row execute function public.enforce_service_price_period();

alter table public.service_branch_settings enable row level security;
alter table public.service_prices enable row level security;
grant select on public.service_branch_settings, public.service_prices to authenticated;

create policy service_branch_settings_select on public.service_branch_settings
for select to authenticated
using (
  public.current_user_has_branch_access(organization_id, branch_id)
  and (
    public.current_user_has_permission(organization_id, 'clinical.read')
    or public.current_user_has_permission(organization_id, 'settings.manage')
  )
);

create policy service_prices_select on public.service_prices
for select to authenticated
using (
  (branch_id is null or public.current_user_has_branch_access(organization_id, branch_id))
  and (
    public.current_user_has_permission(organization_id, 'clinical.read')
    or public.current_user_has_permission(organization_id, 'settings.manage')
    or public.current_user_has_permission(organization_id, 'finance.read')
  )
);

create or replace function public.resolve_service_price(
  org_id uuid,
  target_service_id uuid,
  target_branch_id uuid,
  effective_on date default current_date
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select price.price
  from public.service_prices price
  join public.services service
    on service.organization_id = price.organization_id
    and service.id = price.service_id
  where price.organization_id = org_id
    and price.service_id = target_service_id
    and price.is_active
    and effective_on >= price.valid_from
    and (price.valid_to is null or effective_on <= price.valid_to)
    and (
      price.branch_id = target_branch_id
      or (price.branch_id is null and service.scope = 'organization')
    )
  order by (price.branch_id = target_branch_id) desc, price.valid_from desc
  limit 1;
$$;

create or replace function public.set_service_price(
  org_id uuid,
  target_service_id uuid,
  target_branch_id uuid,
  new_price numeric,
  effective_from date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_price_id uuid;
  service_scope text;
  service_branch_id uuid;
begin
  select service.scope, service.branch_id into service_scope, service_branch_id
  from public.services service
  where service.organization_id = org_id and service.id = target_service_id;
  if service_scope is null then raise exception 'Service not found'; end if;
  if new_price is null or new_price < 0 or effective_from is null then
    raise exception 'Service price is invalid';
  end if;
  if target_branch_id is null then
    if service_scope <> 'organization'
      or not public.current_user_has_permission(org_id, 'directories.manage_global')
      or not public.current_user_has_all_branch_access(org_id)
    then raise exception 'Global directory permission required' using errcode = '42501'; end if;
  else
    if service_scope = 'branch' and service_branch_id <> target_branch_id then
      raise exception 'Local service belongs to another branch';
    end if;
    if not public.current_user_has_permission(org_id, 'directories.manage_branch')
      or not public.current_user_has_branch_access(org_id, target_branch_id)
    then raise exception 'Branch directory permission required' using errcode = '42501'; end if;
  end if;

  if exists (
    select 1 from public.service_prices price
    where price.organization_id = org_id
      and price.service_id = target_service_id
      and price.branch_id is not distinct from target_branch_id
      and price.valid_from > effective_from
  ) then raise exception 'A future service price already exists'; end if;

  update public.service_prices price
  set valid_to = effective_from - 1, is_active = true
  where price.organization_id = org_id
    and price.service_id = target_service_id
    and price.branch_id is not distinct from target_branch_id
    and price.valid_from < effective_from
    and (price.valid_to is null or price.valid_to >= effective_from);

  select price.id into saved_price_id
  from public.service_prices price
  where price.organization_id = org_id
    and price.service_id = target_service_id
    and price.branch_id is not distinct from target_branch_id
    and price.valid_from = effective_from;

  if saved_price_id is null then
    insert into public.service_prices (
      organization_id, service_id, branch_id, price, valid_from, created_by
    ) values (
      org_id, target_service_id, target_branch_id, new_price, effective_from, auth.uid()
    ) returning id into saved_price_id;
  else
    update public.service_prices
    set price = new_price, valid_to = null, is_active = true, created_by = auth.uid()
    where id = saved_price_id;
  end if;

  if effective_from <= current_date
    and (target_branch_id is null or (service_scope = 'branch' and service_branch_id = target_branch_id))
  then
    update public.services set base_price = new_price
    where organization_id = org_id and id = target_service_id;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'service.price_changed', 'service', target_service_id,
    jsonb_build_object('branch_id', target_branch_id, 'price', new_price, 'valid_from', effective_from)
  );
  return saved_price_id;
end;
$$;

drop function if exists public.save_service(uuid, uuid, uuid, text, text, integer, numeric, numeric, numeric);
create function public.save_service(
  org_id uuid,
  target_service_id uuid,
  service_category_id uuid,
  service_code text,
  service_name text,
  service_duration_minutes integer,
  service_base_price numeric,
  service_cost_price numeric,
  service_vat_rate numeric,
  service_scope text,
  service_branch_id uuid,
  price_valid_from date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare saved_service_id uuid; normalized_code text; existing_scope text; existing_branch_id uuid;
begin
  if service_scope not in ('organization', 'branch')
    or (service_scope = 'organization' and service_branch_id is not null)
    or (service_scope = 'branch' and service_branch_id is null)
  then raise exception 'Service scope is invalid'; end if;
  if service_scope = 'organization' then
    if not public.current_user_has_permission(org_id, 'directories.manage_global')
      or not public.current_user_has_all_branch_access(org_id)
    then raise exception 'Global directory permission required' using errcode = '42501'; end if;
  elsif not public.current_user_has_permission(org_id, 'directories.manage_branch')
    or not public.current_user_has_branch_access(org_id, service_branch_id)
  then raise exception 'Branch directory permission required' using errcode = '42501'; end if;

  normalized_code := upper(trim(service_code));
  if normalized_code is null or char_length(normalized_code) not between 1 and 40
    or service_name is null or char_length(trim(service_name)) not between 2 and 240
    or service_duration_minutes not between 5 and 1440
    or service_base_price < 0
    or (service_cost_price is not null and service_cost_price < 0)
    or (service_vat_rate is not null and service_vat_rate not between 0 and 100)
    or price_valid_from is null
  then raise exception 'Service data is invalid'; end if;
  if not exists (
    select 1 from public.service_categories category
    where category.organization_id = org_id and category.id = service_category_id and category.is_active
  ) then raise exception 'Active service category not found'; end if;

  if target_service_id is null then
    insert into public.services (
      organization_id, category_id, code, name, duration_minutes, base_price,
      cost_price, vat_rate, scope, branch_id
    ) values (
      org_id, service_category_id, normalized_code, trim(service_name), service_duration_minutes,
      service_base_price, service_cost_price, service_vat_rate, service_scope, service_branch_id
    ) returning id into saved_service_id;
  else
    select service.scope, service.branch_id into existing_scope, existing_branch_id
    from public.services service
    where service.organization_id = org_id and service.id = target_service_id;
    if existing_scope is null then raise exception 'Service not found'; end if;
    if existing_scope <> service_scope or existing_branch_id is distinct from service_branch_id then
      raise exception 'Service scope cannot be changed after creation';
    end if;
    update public.services set category_id = service_category_id, code = normalized_code,
      name = trim(service_name), duration_minutes = service_duration_minutes,
      cost_price = service_cost_price, vat_rate = service_vat_rate
    where organization_id = org_id and id = target_service_id
    returning id into saved_service_id;
  end if;

  if service_scope = 'branch' then
    insert into public.service_branch_settings (
      organization_id, service_id, branch_id, is_available, duration_minutes
    ) values (org_id, saved_service_id, service_branch_id, true, service_duration_minutes)
    on conflict (service_id, branch_id) do update
    set is_available = true, duration_minutes = excluded.duration_minutes;
  end if;

  perform public.set_service_price(
    org_id, saved_service_id,
    case when service_scope = 'branch' then service_branch_id else null end,
    service_base_price, price_valid_from
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), case when target_service_id is null then 'service.created' else 'service.updated' end,
    'service', saved_service_id,
    jsonb_build_object('code', normalized_code, 'scope', service_scope,
      'branch_id', service_branch_id, 'duration_minutes', service_duration_minutes)
  );
  return saved_service_id;
end;
$$;

create or replace function public.save_service_branch_override(
  org_id uuid,
  target_service_id uuid,
  target_branch_id uuid,
  service_is_available boolean,
  service_duration_minutes integer,
  service_price numeric,
  price_valid_from date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'directories.manage_branch')
    or not public.current_user_has_branch_access(org_id, target_branch_id)
  then raise exception 'Branch directory permission required' using errcode = '42501'; end if;
  if service_is_available is null
    or (service_duration_minutes is not null and service_duration_minutes not between 5 and 1440)
  then raise exception 'Service branch settings are invalid'; end if;
  if not exists (
    select 1 from public.services service
    where service.organization_id = org_id and service.id = target_service_id
      and service.scope = 'organization'
  ) then raise exception 'Global service not found'; end if;

  insert into public.service_branch_settings (
    organization_id, service_id, branch_id, is_available, duration_minutes
  ) values (
    org_id, target_service_id, target_branch_id, service_is_available, service_duration_minutes
  ) on conflict (service_id, branch_id) do update
  set is_available = excluded.is_available, duration_minutes = excluded.duration_minutes;

  if service_price is not null then
    perform public.set_service_price(
      org_id, target_service_id, target_branch_id, service_price, price_valid_from
    );
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'service.branch_override_saved', 'service', target_service_id,
    jsonb_build_object('branch_id', target_branch_id, 'is_available', service_is_available,
      'duration_minutes', service_duration_minutes, 'price', service_price)
  );
end;
$$;

create or replace function public.set_service_active(
  org_id uuid,
  target_service_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare service_scope text; service_branch_id uuid;
begin
  select service.scope, service.branch_id into service_scope, service_branch_id
  from public.services service
  where service.organization_id = org_id and service.id = target_service_id;
  if service_scope is null or target_is_active is null then raise exception 'Service not found'; end if;
  if service_scope = 'organization' then
    if not public.current_user_has_permission(org_id, 'directories.manage_global')
      or not public.current_user_has_all_branch_access(org_id)
    then raise exception 'Global directory permission required' using errcode = '42501'; end if;
  elsif not public.current_user_has_permission(org_id, 'directories.manage_branch')
    or not public.current_user_has_branch_access(org_id, service_branch_id)
  then raise exception 'Branch directory permission required' using errcode = '42501'; end if;

  update public.services set is_active = target_is_active
  where organization_id = org_id and id = target_service_id;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'service.activity_changed', 'service', target_service_id,
    jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

drop function if exists public.list_services(uuid);
create or replace function public.list_service_categories(org_id uuid)
returns table (id uuid, parent_id uuid, name text, sort_order integer, is_active boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select category.id, category.parent_id, category.name, category.sort_order, category.is_active
  from public.service_categories category
  where category.organization_id = org_id
    and (
      public.current_user_has_permission(org_id, 'clinical.read')
      or public.current_user_has_permission(org_id, 'settings.manage')
      or public.current_user_has_permission(org_id, 'directories.manage_global')
      or public.current_user_has_permission(org_id, 'directories.manage_branch')
    )
    and (category.is_active or public.current_user_has_permission(org_id, 'directories.manage_global'))
  order by category.sort_order, category.name;
$$;

create function public.list_services(
  org_id uuid,
  target_branch_id uuid default null,
  effective_on date default current_date
)
returns table (
  id uuid, category_id uuid, code text, name text, duration_minutes integer,
  base_price numeric, cost_price numeric, is_active boolean, vat_rate numeric,
  scope text, branch_id uuid, branch_name text, network_price numeric,
  price_source text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select service.id, service.category_id, service.code, service.name,
    coalesce(settings.duration_minutes, service.duration_minutes),
    coalesce(public.resolve_service_price(org_id, service.id, target_branch_id, effective_on), service.base_price),
    case when public.current_user_has_permission(org_id, 'settings.manage')
      or public.current_user_has_permission(org_id, 'finance.read') then service.cost_price else null end,
    service.is_active, service.vat_rate, service.scope, service.branch_id, branch.name,
    public.resolve_service_price(org_id, service.id, null, effective_on),
    case when service.scope = 'branch' or exists (
      select 1 from public.service_prices price
      where price.organization_id = org_id and price.service_id = service.id
        and price.branch_id = target_branch_id and price.is_active
        and effective_on >= price.valid_from and (price.valid_to is null or effective_on <= price.valid_to)
    ) then 'branch' else 'organization' end
  from public.services service
  left join public.service_branch_settings settings
    on settings.organization_id = service.organization_id
    and settings.service_id = service.id and settings.branch_id = target_branch_id
  left join public.branches branch
    on branch.organization_id = service.organization_id and branch.id = service.branch_id
  where service.organization_id = org_id
    and (public.current_user_has_permission(org_id, 'clinical.read')
      or public.current_user_has_permission(org_id, 'settings.manage')
      or public.current_user_has_permission(org_id, 'directories.manage_global')
      or public.current_user_has_permission(org_id, 'directories.manage_branch'))
    and (service.is_active or public.current_user_has_permission(org_id, 'directories.manage_global')
      or public.current_user_has_permission(org_id, 'directories.manage_branch'))
    and (
      target_branch_id is null
      or (service.scope = 'organization' and coalesce(settings.is_available, true))
      or (service.scope = 'branch' and service.branch_id = target_branch_id)
    )
    and (service.branch_id is null or public.current_user_has_branch_access(org_id, service.branch_id))
  order by service.name;
$$;

create or replace function public.apply_branch_price_to_performed_service()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  encounter_branch_id uuid;
  encounter_branch_timezone text;
  resolved_price numeric;
begin
  if new.treatment_plan_item_id is not null then return new; end if;

  select encounter.branch_id, branch.timezone
  into encounter_branch_id, encounter_branch_timezone
  from public.clinical_encounters encounter
  join public.branches branch
    on branch.organization_id = encounter.organization_id
    and branch.id = encounter.branch_id
  where encounter.organization_id = new.organization_id
    and encounter.id = new.encounter_id;

  if not exists (
    select 1
    from public.services service
    left join public.service_branch_settings settings
      on settings.organization_id = service.organization_id
      and settings.service_id = service.id
      and settings.branch_id = encounter_branch_id
    where service.organization_id = new.organization_id
      and service.id = new.service_id
      and service.is_active
      and (
        (service.scope = 'organization' and coalesce(settings.is_available, true))
        or (service.scope = 'branch' and service.branch_id = encounter_branch_id)
      )
  ) then
    raise exception 'Service is unavailable in the encounter branch';
  end if;

  resolved_price := public.resolve_service_price(
    new.organization_id,
    new.service_id,
    encounter_branch_id,
    (new.performed_at at time zone encounter_branch_timezone)::date
  );
  if resolved_price is null then raise exception 'Active service price not found'; end if;
  if new.discount_amount > round(new.quantity * resolved_price, 2) then
    raise exception 'Performed service discount exceeds the branch price';
  end if;

  new.unit_price := resolved_price;
  new.final_amount := round(new.quantity * resolved_price, 2) - new.discount_amount;
  return new;
end;
$$;

create trigger performed_services_branch_price_guard
before insert on public.performed_services
for each row execute function public.apply_branch_price_to_performed_service();

revoke all on function public.resolve_service_price(uuid, uuid, uuid, date) from public;
revoke all on function public.set_service_price(uuid, uuid, uuid, numeric, date) from public;
revoke all on function public.save_service(uuid, uuid, uuid, text, text, integer, numeric, numeric, numeric, text, uuid, date) from public;
revoke all on function public.save_service_branch_override(uuid, uuid, uuid, boolean, integer, numeric, date) from public;
revoke all on function public.list_services(uuid, uuid, date) from public;
grant execute on function public.resolve_service_price(uuid, uuid, uuid, date) to authenticated;
grant execute on function public.set_service_price(uuid, uuid, uuid, numeric, date) to authenticated;
grant execute on function public.save_service(uuid, uuid, uuid, text, text, integer, numeric, numeric, numeric, text, uuid, date) to authenticated;
grant execute on function public.save_service_branch_override(uuid, uuid, uuid, boolean, integer, numeric, date) to authenticated;
grant execute on function public.list_services(uuid, uuid, date) to authenticated;

commit;
