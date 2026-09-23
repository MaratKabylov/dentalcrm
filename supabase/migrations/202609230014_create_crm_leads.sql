insert into public.permissions (code, description) values
  ('crm.read', 'Просмотр CRM'),
  ('crm.manage', 'Управление лидами и источниками')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = any(array['crm.read', 'crm.manage'])
where role.organization_id is null
  and role.code = any(array['owner', 'administrator', 'receptionist', 'marketer', 'manager'])
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'crm.read'
where role.organization_id is null and role.code = 'auditor'
on conflict do nothing;

alter table public.organization_members
  add constraint organization_members_organization_id_id_key unique (organization_id, id);

create table public.patient_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  color text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code),
  unique (organization_id, name)
);

create index patient_sources_organization_active_idx
  on public.patient_sources (organization_id, is_active, sort_order, name);

create trigger patient_sources_set_updated_at before update on public.patient_sources
for each row execute function public.set_updated_at();

create or replace function public.add_default_patient_sources()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.patient_sources (organization_id, code, name, color, sort_order) values
    (new.id, 'instagram', 'Instagram', '#E1306C', 10),
    (new.id, 'tiktok', 'TikTok', '#111827', 20),
    (new.id, 'google', 'Google', '#4285F4', 30),
    (new.id, '2gis', '2GIS', '#65A30D', 40),
    (new.id, 'recommendation', 'Рекомендация', '#7C3AED', 50),
    (new.id, 'website', 'Сайт', '#0891B2', 60),
    (new.id, 'outdoor', 'Наружная реклама', '#EA580C', 70),
    (new.id, 'unknown', 'Неизвестно', '#64748B', 1000)
  on conflict (organization_id, code) do nothing;
  return new;
end;
$$;

create trigger organizations_add_default_patient_sources
after insert on public.organizations
for each row execute function public.add_default_patient_sources();

insert into public.patient_sources (organization_id, code, name, color, sort_order)
select organization.id, source.code, source.name, source.color, source.sort_order
from public.organizations organization
cross join (values
  ('instagram', 'Instagram', '#E1306C', 10),
  ('tiktok', 'TikTok', '#111827', 20),
  ('google', 'Google', '#4285F4', 30),
  ('2gis', '2GIS', '#65A30D', 40),
  ('recommendation', 'Рекомендация', '#7C3AED', 50),
  ('website', 'Сайт', '#0891B2', 60),
  ('outdoor', 'Наружная реклама', '#EA580C', 70),
  ('unknown', 'Неизвестно', '#64748B', 1000)
) as source(code, name, color, sort_order)
on conflict (organization_id, code) do nothing;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid,
  full_name text not null check (char_length(trim(full_name)) between 2 and 200),
  phone text not null check (char_length(trim(phone)) between 5 and 30),
  phone_normalized text not null,
  email text,
  source_id uuid not null,
  status text not null default 'new' check (status in (
    'new', 'contacted', 'appointment_booked', 'thinking', 'lost', 'converted'
  )),
  assigned_to uuid,
  notes text check (notes is null or char_length(notes) <= 5000),
  converted_patient_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint leads_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint leads_source_fkey foreign key (organization_id, source_id)
    references public.patient_sources(organization_id, id) on delete restrict,
  constraint leads_assignee_fkey foreign key (organization_id, assigned_to)
    references public.organization_members(organization_id, id) on delete restrict,
  constraint leads_converted_patient_fkey foreign key (organization_id, converted_patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint leads_conversion_consistency check (
    (status = 'converted' and converted_patient_id is not null)
    or (status <> 'converted' and converted_patient_id is null)
  ),
  unique (organization_id, id)
);

create index leads_pipeline_idx on public.leads (organization_id, status, updated_at desc)
  where archived_at is null;
create index leads_source_idx on public.leads (organization_id, source_id, created_at desc)
  where archived_at is null;
create index leads_assignee_idx on public.leads (organization_id, assigned_to, updated_at desc)
  where archived_at is null;
create index leads_phone_idx on public.leads (organization_id, phone_normalized);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  lead_id uuid not null,
  type text not null check (type in ('note', 'call', 'email', 'message', 'status_change')),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint lead_activities_lead_fkey foreign key (organization_id, lead_id)
    references public.leads(organization_id, id) on delete cascade
);

create index lead_activities_lead_time_idx
  on public.lead_activities (organization_id, lead_id, created_at desc);

create or replace function public.normalize_lead_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.full_name = trim(new.full_name);
  new.phone = trim(new.phone);
  new.phone_normalized = public.normalize_phone(new.phone);
  new.email = nullif(lower(trim(new.email)), '');
  new.notes = nullif(trim(new.notes), '');
  return new;
end;
$$;

create trigger leads_normalize_fields
before insert or update of full_name, phone, email, notes on public.leads
for each row execute function public.normalize_lead_fields();

create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();

alter table public.patient_sources enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;

create policy patient_sources_select on public.patient_sources
for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'crm.read')
  or public.current_user_has_permission(organization_id, 'patients.create')
);

create policy leads_select on public.leads
for select to authenticated
using (public.current_user_has_permission(organization_id, 'crm.read'));

create policy lead_activities_select on public.lead_activities
for select to authenticated
using (public.current_user_has_permission(organization_id, 'crm.read'));

grant select on public.patient_sources, public.leads, public.lead_activities to authenticated;

create or replace function public.save_patient_source(
  org_id uuid,
  target_source_id uuid,
  source_code text,
  source_name text,
  source_color text,
  source_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_source_id uuid;
  normalized_code text := lower(trim(source_code));
begin
  if not public.current_user_has_permission(org_id, 'crm.manage') then
    raise exception 'CRM manage permission required' using errcode = '42501';
  end if;
  if normalized_code is null or normalized_code !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'Source code is invalid';
  end if;
  if source_name is null or char_length(trim(source_name)) not between 2 and 120 then
    raise exception 'Source name is invalid';
  end if;
  if source_color is null or source_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Source color is invalid';
  end if;
  if source_sort_order is null or source_sort_order not between 0 and 10000 then
    raise exception 'Source sort order is invalid';
  end if;
  if target_source_id is not null and exists (
    select 1 from public.patient_sources source
    where source.organization_id = org_id
      and source.id = target_source_id
      and source.code = 'unknown'
  ) and normalized_code <> 'unknown' then
    raise exception 'Default source code cannot be changed';
  end if;

  if target_source_id is null then
    insert into public.patient_sources (organization_id, code, name, color, sort_order)
    values (org_id, normalized_code, trim(source_name), upper(source_color), source_sort_order)
    returning id into saved_source_id;
  else
    update public.patient_sources
    set code = normalized_code,
        name = trim(source_name),
        color = upper(source_color),
        sort_order = source_sort_order
    where id = target_source_id and organization_id = org_id
    returning id into saved_source_id;
    if saved_source_id is null then raise exception 'Source not found'; end if;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(),
    case when target_source_id is null then 'patient_source.created' else 'patient_source.updated' end,
    'patient_source', saved_source_id,
    jsonb_build_object('code', normalized_code, 'name', trim(source_name), 'color', upper(source_color))
  );
  return saved_source_id;
end;
$$;

create or replace function public.set_patient_source_active(
  org_id uuid,
  target_source_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'crm.manage') then
    raise exception 'CRM manage permission required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.patient_sources
    where organization_id = org_id and id = target_source_id and code = 'unknown'
  ) and not target_is_active then
    raise exception 'Default source cannot be disabled';
  end if;
  update public.patient_sources
  set is_active = target_is_active
  where organization_id = org_id and id = target_source_id;
  if not found then raise exception 'Source not found'; end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'patient_source.activity_changed', 'patient_source', target_source_id,
    jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

create or replace function public.save_lead(
  org_id uuid,
  target_lead_id uuid,
  lead_branch_id uuid,
  lead_full_name text,
  lead_phone text,
  lead_email text,
  lead_source_id uuid,
  lead_assigned_to uuid,
  lead_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_lead_id uuid;
  resolved_source_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'crm.manage') then
    raise exception 'CRM manage permission required' using errcode = '42501';
  end if;
  if lead_full_name is null or char_length(trim(lead_full_name)) not between 2 and 200 then
    raise exception 'Lead name is invalid';
  end if;
  if lead_phone is null or char_length(public.normalize_phone(lead_phone)) not between 5 and 15 then
    raise exception 'Lead phone is invalid';
  end if;
  if lead_branch_id is not null and not exists (
    select 1 from public.branches where organization_id = org_id and id = lead_branch_id and is_active
  ) then raise exception 'Active branch not found'; end if;
  if lead_assigned_to is not null and not exists (
    select 1 from public.organization_members
    where organization_id = org_id and id = lead_assigned_to and status = 'active'
  ) then raise exception 'Active assignee not found'; end if;

  select source.id into resolved_source_id
  from public.patient_sources source
  where source.organization_id = org_id
    and source.id = coalesce(lead_source_id, source.id)
    and (
      source.is_active
      or exists (
        select 1 from public.leads current_lead
        where current_lead.organization_id = org_id
          and current_lead.id = target_lead_id
          and current_lead.source_id = source.id
      )
    )
    and (lead_source_id is not null or source.code = 'unknown')
  order by case when source.code = 'unknown' then 0 else 1 end
  limit 1;
  if resolved_source_id is null then raise exception 'Active source not found'; end if;

  if target_lead_id is null then
    insert into public.leads (
      organization_id, branch_id, full_name, phone, phone_normalized, email,
      source_id, assigned_to, notes
    ) values (
      org_id, lead_branch_id, lead_full_name, lead_phone, public.normalize_phone(lead_phone), lead_email,
      resolved_source_id, lead_assigned_to, lead_notes
    ) returning id into saved_lead_id;

    insert into public.lead_activities (organization_id, lead_id, type, body, employee_id)
    values (org_id, saved_lead_id, 'note', 'Лид создан', auth.uid());
  else
    update public.leads
    set branch_id = lead_branch_id,
        full_name = lead_full_name,
        phone = lead_phone,
        email = lead_email,
        source_id = resolved_source_id,
        assigned_to = lead_assigned_to,
        notes = lead_notes
    where organization_id = org_id and id = target_lead_id and archived_at is null
    returning id into saved_lead_id;
    if saved_lead_id is null then raise exception 'Lead not found'; end if;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(),
    case when target_lead_id is null then 'lead.created' else 'lead.updated' end,
    'lead', saved_lead_id,
    jsonb_build_object('source_id', resolved_source_id, 'branch_id', lead_branch_id, 'assigned_to', lead_assigned_to)
  );
  return saved_lead_id;
end;
$$;

create or replace function public.set_lead_status(
  org_id uuid,
  target_lead_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_status text;
begin
  if not public.current_user_has_permission(org_id, 'crm.manage') then
    raise exception 'CRM manage permission required' using errcode = '42501';
  end if;
  if target_status not in ('new', 'contacted', 'appointment_booked', 'thinking', 'lost') then
    raise exception 'Lead status is invalid';
  end if;
  select status into previous_status from public.leads
  where organization_id = org_id and id = target_lead_id and archived_at is null
  for update;
  if previous_status is null then raise exception 'Lead not found'; end if;
  if previous_status = 'converted' then raise exception 'Converted lead cannot change status'; end if;
  if previous_status = target_status then return; end if;

  update public.leads set status = target_status
  where organization_id = org_id and id = target_lead_id;
  insert into public.lead_activities (organization_id, lead_id, type, body, employee_id)
  values (org_id, target_lead_id, 'status_change', previous_status || ' → ' || target_status, auth.uid());
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    org_id, auth.uid(), 'lead.status_changed', 'lead', target_lead_id,
    jsonb_build_object('status', previous_status), jsonb_build_object('status', target_status)
  );
end;
$$;

create or replace function public.add_lead_activity(
  org_id uuid,
  target_lead_id uuid,
  activity_type text,
  activity_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_activity_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'crm.manage') then
    raise exception 'CRM manage permission required' using errcode = '42501';
  end if;
  if activity_type not in ('note', 'call', 'email', 'message') then
    raise exception 'Activity type is invalid';
  end if;
  if activity_body is null or char_length(trim(activity_body)) not between 1 and 5000 then
    raise exception 'Activity body is invalid';
  end if;
  if not exists (
    select 1 from public.leads
    where organization_id = org_id and id = target_lead_id and archived_at is null
  ) then raise exception 'Lead not found'; end if;

  insert into public.lead_activities (organization_id, lead_id, type, body, employee_id)
  values (org_id, target_lead_id, activity_type, trim(activity_body), auth.uid())
  returning id into new_activity_id;
  update public.leads set updated_at = now()
  where organization_id = org_id and id = target_lead_id;
  return new_activity_id;
end;
$$;

create or replace function public.list_patient_sources(
  org_id uuid,
  include_inactive boolean default false
)
returns table (
  id uuid, code text, name text, color text, sort_order integer, is_active boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select source.id, source.code, source.name, source.color, source.sort_order, source.is_active
  from public.patient_sources source
  where source.organization_id = org_id
    and (
      public.current_user_has_permission(org_id, 'crm.read')
      or public.current_user_has_permission(org_id, 'patients.create')
    )
    and (source.is_active or include_inactive and public.current_user_has_permission(org_id, 'crm.manage'))
  order by source.sort_order, source.name;
$$;

create or replace function public.list_crm_assignees(org_id uuid)
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select member.id, coalesce(nullif(trim(profile.full_name), ''), 'Сотрудник')
  from public.organization_members member
  join public.profiles profile on profile.id = member.user_id
  where member.organization_id = org_id
    and member.status = 'active'
    and public.current_user_has_permission(org_id, 'crm.read')
  order by 2;
$$;

create or replace function public.list_crm_branches(org_id uuid)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select branch.id, branch.name
  from public.branches branch
  where branch.organization_id = org_id
    and branch.is_active
    and public.current_user_has_permission(org_id, 'crm.read')
  order by branch.name;
$$;

create or replace function public.list_crm_leads(
  org_id uuid,
  search_query text default null,
  status_filter text default null,
  source_filter uuid default null,
  branch_filter uuid default null,
  lead_filter uuid default null,
  result_limit integer default 100
)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  full_name text,
  phone text,
  email text,
  source_id uuid,
  source_name text,
  source_color text,
  status text,
  assigned_to uuid,
  assignee_name text,
  notes text,
  converted_patient_id uuid,
  activity_count bigint,
  last_activity_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    lead.id,
    lead.branch_id,
    branch.name,
    lead.full_name,
    lead.phone,
    lead.email,
    lead.source_id,
    source.name,
    source.color,
    lead.status,
    lead.assigned_to,
    coalesce(nullif(trim(profile.full_name), ''), case when lead.assigned_to is null then null else 'Сотрудник' end),
    lead.notes,
    lead.converted_patient_id,
    count(activity.id),
    max(activity.created_at),
    lead.created_at,
    lead.updated_at
  from public.leads lead
  join public.patient_sources source
    on source.organization_id = lead.organization_id and source.id = lead.source_id
  left join public.branches branch
    on branch.organization_id = lead.organization_id and branch.id = lead.branch_id
  left join public.organization_members member
    on member.organization_id = lead.organization_id and member.id = lead.assigned_to
  left join public.profiles profile on profile.id = member.user_id
  left join public.lead_activities activity
    on activity.organization_id = lead.organization_id and activity.lead_id = lead.id
  where lead.organization_id = org_id
    and lead.archived_at is null
    and public.current_user_has_permission(org_id, 'crm.read')
    and (status_filter is null or lead.status = status_filter)
    and (source_filter is null or lead.source_id = source_filter)
    and (branch_filter is null or lead.branch_id = branch_filter)
    and (lead_filter is null or lead.id = lead_filter)
    and (
      nullif(trim(search_query), '') is null
      or lead.full_name ilike '%' || trim(search_query) || '%'
      or (
        public.normalize_phone(search_query) <> ''
        and lead.phone_normalized like '%' || public.normalize_phone(search_query) || '%'
      )
      or lead.email ilike '%' || trim(search_query) || '%'
    )
  group by lead.id, branch.name, source.name, source.color, profile.full_name
  order by lead.updated_at desc
  limit least(greatest(result_limit, 1), 500);
$$;

create or replace function public.get_crm_lead(org_id uuid, target_lead_id uuid)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  full_name text,
  phone text,
  email text,
  source_id uuid,
  source_name text,
  source_color text,
  status text,
  assigned_to uuid,
  assignee_name text,
  notes text,
  converted_patient_id uuid,
  activity_count bigint,
  last_activity_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lead.* from public.list_crm_leads(org_id, null, null, null, null, target_lead_id, 1) lead;
$$;

create or replace function public.list_lead_activities(org_id uuid, target_lead_id uuid)
returns table (
  id uuid, type text, body text, employee_name text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    activity.id,
    activity.type,
    activity.body,
    coalesce(nullif(trim(profile.full_name), ''), 'Сотрудник'),
    activity.created_at
  from public.lead_activities activity
  join public.profiles profile on profile.id = activity.employee_id
  where activity.organization_id = org_id
    and activity.lead_id = target_lead_id
    and public.current_user_has_permission(org_id, 'crm.read')
  order by activity.created_at desc;
$$;

revoke all on function public.save_patient_source(uuid, uuid, text, text, text, integer) from public;
revoke all on function public.set_patient_source_active(uuid, uuid, boolean) from public;
revoke all on function public.save_lead(uuid, uuid, uuid, text, text, text, uuid, uuid, text) from public;
revoke all on function public.set_lead_status(uuid, uuid, text) from public;
revoke all on function public.add_lead_activity(uuid, uuid, text, text) from public;
revoke all on function public.list_patient_sources(uuid, boolean) from public;
revoke all on function public.list_crm_assignees(uuid) from public;
revoke all on function public.list_crm_branches(uuid) from public;
revoke all on function public.list_crm_leads(uuid, text, text, uuid, uuid, uuid, integer) from public;
revoke all on function public.get_crm_lead(uuid, uuid) from public;
revoke all on function public.list_lead_activities(uuid, uuid) from public;

grant execute on function public.save_patient_source(uuid, uuid, text, text, text, integer) to authenticated;
grant execute on function public.set_patient_source_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.save_lead(uuid, uuid, uuid, text, text, text, uuid, uuid, text) to authenticated;
grant execute on function public.set_lead_status(uuid, uuid, text) to authenticated;
grant execute on function public.add_lead_activity(uuid, uuid, text, text) to authenticated;
grant execute on function public.list_patient_sources(uuid, boolean) to authenticated;
grant execute on function public.list_crm_assignees(uuid) to authenticated;
grant execute on function public.list_crm_branches(uuid) to authenticated;
grant execute on function public.list_crm_leads(uuid, text, text, uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.get_crm_lead(uuid, uuid) to authenticated;
grant execute on function public.list_lead_activities(uuid, uuid) to authenticated;
