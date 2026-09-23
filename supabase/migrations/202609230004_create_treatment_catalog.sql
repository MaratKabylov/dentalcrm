create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  parent_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 160),
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_categories_parent_fkey foreign key (organization_id, parent_id)
    references public.service_categories(organization_id, id) on delete restrict,
  constraint service_categories_not_own_parent check (parent_id is null or parent_id <> id),
  unique (organization_id, id),
  constraint service_categories_name_unique
    unique nulls not distinct (organization_id, parent_id, name)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (char_length(trim(code)) between 1 and 40),
  name text not null check (char_length(trim(name)) between 2 and 240),
  category_id uuid not null,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  base_price numeric(14,2) not null check (base_price >= 0),
  cost_price numeric(14,2) check (cost_price is null or cost_price >= 0),
  is_active boolean not null default true,
  vat_rate numeric(5,2) check (vat_rate is null or vat_rate between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_category_fkey foreign key (organization_id, category_id)
    references public.service_categories(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, code)
);

create index service_categories_tree_idx
  on public.service_categories (organization_id, parent_id, sort_order, name);
create index services_category_active_idx
  on public.services (category_id, is_active, name);

create trigger service_categories_set_updated_at before update on public.service_categories
for each row execute function public.set_updated_at();
create trigger services_set_updated_at before update on public.services
for each row execute function public.set_updated_at();

alter table public.service_categories enable row level security;
alter table public.services enable row level security;

create policy service_categories_select on public.service_categories
for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'clinical.read')
  or public.current_user_has_permission(organization_id, 'settings.manage')
);
create policy services_select on public.services
for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'clinical.read')
  or public.current_user_has_permission(organization_id, 'settings.manage')
);

grant select on public.service_categories to authenticated;
grant select (
  id, organization_id, code, name, category_id, duration_minutes,
  base_price, is_active, vat_rate, created_at, updated_at
) on public.services to authenticated;

create or replace function public.save_service_category(
  org_id uuid,
  target_category_id uuid,
  category_parent_id uuid,
  category_name text,
  category_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_category_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'settings.manage') then
    raise exception 'Settings manage permission required' using errcode = '42501';
  end if;
  if category_name is null or char_length(trim(category_name)) not between 2 and 160 then
    raise exception 'Category name is invalid';
  end if;
  if category_sort_order is null or category_sort_order not between 0 and 10000 then
    raise exception 'Category sort order is invalid';
  end if;
  if category_parent_id is not null and not exists (
    select 1 from public.service_categories category
    where category.id = category_parent_id
      and category.organization_id = org_id
      and category.is_active
  ) then
    raise exception 'Active parent category not found';
  end if;

  if target_category_id is null then
    insert into public.service_categories (
      organization_id, parent_id, name, sort_order
    ) values (
      org_id, category_parent_id, trim(category_name), category_sort_order
    ) returning id into saved_category_id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      org_id, auth.uid(), 'service_category.created', 'service_category', saved_category_id,
      jsonb_build_object('parent_id', category_parent_id, 'name', trim(category_name))
    );
  else
    if not exists (
      select 1 from public.service_categories category
      where category.id = target_category_id and category.organization_id = org_id
    ) then
      raise exception 'Service category not found';
    end if;
    if category_parent_id = target_category_id then
      raise exception 'Category cannot be its own parent';
    end if;
    if category_parent_id is not null and exists (
      with recursive descendants as (
        select category.id
        from public.service_categories category
        where category.parent_id = target_category_id
          and category.organization_id = org_id
        union all
        select category.id
        from public.service_categories category
        join descendants descendant on category.parent_id = descendant.id
        where category.organization_id = org_id
      )
      select 1 from descendants where id = category_parent_id
    ) then
      raise exception 'Category hierarchy cycle detected';
    end if;

    update public.service_categories
    set parent_id = category_parent_id,
        name = trim(category_name),
        sort_order = category_sort_order
    where id = target_category_id and organization_id = org_id
    returning id into saved_category_id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      org_id, auth.uid(), 'service_category.updated', 'service_category', saved_category_id,
      jsonb_build_object('parent_id', category_parent_id, 'name', trim(category_name))
    );
  end if;

  return saved_category_id;
end;
$$;

create or replace function public.save_service(
  org_id uuid,
  target_service_id uuid,
  service_category_id uuid,
  service_code text,
  service_name text,
  service_duration_minutes integer,
  service_base_price numeric,
  service_cost_price numeric,
  service_vat_rate numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_service_id uuid;
  normalized_code text;
begin
  if not public.current_user_has_permission(org_id, 'settings.manage') then
    raise exception 'Settings manage permission required' using errcode = '42501';
  end if;

  normalized_code := upper(trim(service_code));
  if normalized_code is null or char_length(normalized_code) not between 1 and 40 then
    raise exception 'Service code is invalid';
  end if;
  if service_name is null or char_length(trim(service_name)) not between 2 and 240 then
    raise exception 'Service name is invalid';
  end if;
  if service_duration_minutes is null or service_duration_minutes not between 5 and 1440 then
    raise exception 'Service duration is invalid';
  end if;
  if service_base_price is null or service_base_price < 0 then
    raise exception 'Service base price is invalid';
  end if;
  if service_cost_price is not null and service_cost_price < 0 then
    raise exception 'Service cost price is invalid';
  end if;
  if service_vat_rate is not null and service_vat_rate not between 0 and 100 then
    raise exception 'Service VAT rate is invalid';
  end if;
  if not exists (
    select 1 from public.service_categories category
    where category.id = service_category_id
      and category.organization_id = org_id
      and category.is_active
  ) then
    raise exception 'Active service category not found';
  end if;

  if target_service_id is null then
    insert into public.services (
      organization_id, category_id, code, name, duration_minutes,
      base_price, cost_price, vat_rate
    ) values (
      org_id, service_category_id, normalized_code, trim(service_name),
      service_duration_minutes, service_base_price, service_cost_price, service_vat_rate
    ) returning id into saved_service_id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      org_id, auth.uid(), 'service.created', 'service', saved_service_id,
      jsonb_build_object(
        'code', normalized_code,
        'category_id', service_category_id,
        'base_price', service_base_price,
        'duration_minutes', service_duration_minutes
      )
    );
  else
    update public.services
    set category_id = service_category_id,
        code = normalized_code,
        name = trim(service_name),
        duration_minutes = service_duration_minutes,
        base_price = service_base_price,
        cost_price = service_cost_price,
        vat_rate = service_vat_rate
    where id = target_service_id and organization_id = org_id
    returning id into saved_service_id;

    if saved_service_id is null then
      raise exception 'Service not found';
    end if;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      org_id, auth.uid(), 'service.updated', 'service', saved_service_id,
      jsonb_build_object(
        'code', normalized_code,
        'category_id', service_category_id,
        'base_price', service_base_price,
        'duration_minutes', service_duration_minutes
      )
    );
  end if;

  return saved_service_id;
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
begin
  if not public.current_user_has_permission(org_id, 'settings.manage') then
    raise exception 'Settings manage permission required' using errcode = '42501';
  end if;

  update public.services
  set is_active = target_is_active
  where id = target_service_id and organization_id = org_id;
  if not found then
    raise exception 'Service not found';
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'service.activity_changed', 'service', target_service_id,
    jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

create or replace function public.list_service_categories(org_id uuid)
returns table (
  id uuid,
  parent_id uuid,
  name text,
  sort_order integer,
  is_active boolean
)
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
    )
    and (
      category.is_active
      or public.current_user_has_permission(org_id, 'settings.manage')
    )
  order by category.sort_order, category.name;
$$;

create or replace function public.list_services(org_id uuid)
returns table (
  id uuid,
  category_id uuid,
  code text,
  name text,
  duration_minutes integer,
  base_price numeric,
  cost_price numeric,
  is_active boolean,
  vat_rate numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    service.id,
    service.category_id,
    service.code,
    service.name,
    service.duration_minutes,
    service.base_price,
    case
      when public.current_user_has_permission(org_id, 'settings.manage')
        or public.current_user_has_permission(org_id, 'finance.read')
      then service.cost_price
      else null
    end,
    service.is_active,
    service.vat_rate
  from public.services service
  where service.organization_id = org_id
    and (
      public.current_user_has_permission(org_id, 'clinical.read')
      or public.current_user_has_permission(org_id, 'settings.manage')
    )
    and (
      service.is_active
      or public.current_user_has_permission(org_id, 'settings.manage')
    )
  order by service.name;
$$;

revoke all on function public.save_service_category(uuid, uuid, uuid, text, integer) from public;
revoke all on function public.save_service(
  uuid, uuid, uuid, text, text, integer, numeric, numeric, numeric
) from public;
revoke all on function public.set_service_active(uuid, uuid, boolean) from public;
revoke all on function public.list_service_categories(uuid) from public;
revoke all on function public.list_services(uuid) from public;

grant execute on function public.save_service_category(uuid, uuid, uuid, text, integer) to authenticated;
grant execute on function public.save_service(
  uuid, uuid, uuid, text, text, integer, numeric, numeric, numeric
) to authenticated;
grant execute on function public.set_service_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_service_categories(uuid) to authenticated;
grant execute on function public.list_services(uuid) to authenticated;
