begin;

alter table public.specializations
  add column is_active boolean not null default true,
  add column is_system boolean not null default false;

alter table public.patient_tags
  add column scope text not null default 'organization'
    constraint patient_tags_scope_value_check check (scope in ('organization', 'branch')),
  add column branch_id uuid,
  add column is_active boolean not null default true,
  add column is_system boolean not null default false,
  add constraint patient_tags_scope_check check (
    (scope = 'organization' and branch_id is null)
    or (scope = 'branch' and branch_id is not null)
  ),
  add constraint patient_tags_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict;

alter table public.patient_tags
  drop constraint patient_tags_organization_id_name_key,
  add constraint patient_tags_scope_name_unique
    unique nulls not distinct (organization_id, branch_id, name);

-- Tags are retained for history; management now archives them through the RPC below.
drop policy patient_tags_delete on public.patient_tags;

alter table public.patient_sources add column is_system boolean not null default false;
alter table public.payment_methods add column is_system boolean not null default true;
alter table public.appointment_statuses
  add column is_active boolean not null default true,
  add column is_system boolean not null default true;

update public.patient_sources
set is_system = code = any(array[
  'instagram','tiktok','google','2gis','recommendation','website','outdoor','unknown'
]);

-- Keep default sources protected for organizations created after this migration too.
create or replace function public.add_default_patient_sources()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.patient_sources (
    organization_id, code, name, color, sort_order, is_system
  ) values
    (new.id, 'instagram', 'Instagram', '#E1306C', 10, true),
    (new.id, 'tiktok', 'TikTok', '#111827', 20, true),
    (new.id, 'google', 'Google', '#4285F4', 30, true),
    (new.id, '2gis', '2GIS', '#65A30D', 40, true),
    (new.id, 'recommendation', 'Рекомендация', '#7C3AED', 50, true),
    (new.id, 'website', 'Сайт', '#0891B2', 60, true),
    (new.id, 'outdoor', 'Наружная реклама', '#EA580C', 70, true),
    (new.id, 'unknown', 'Неизвестно', '#64748B', 1000, true)
  on conflict (organization_id, code) do nothing;
  return new;
end;
$$;

create table public.directory_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in (
    'employee_position', 'appointment_cancellation_reason', 'expense_category'
  )),
  code text not null check (code ~ '^[a-z0-9_]{2,60}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  scope text not null default 'organization'
    constraint directory_entries_scope_value_check check (scope in ('organization', 'branch')),
  branch_id uuid,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint directory_entries_scope_check check (
    (scope = 'organization' and branch_id is null)
    or (scope = 'branch' and branch_id is not null)
  ),
  constraint directory_entries_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  unique nulls not distinct (organization_id, kind, branch_id, code),
  unique (organization_id, id)
);

create index directory_entries_lookup_idx
  on public.directory_entries (organization_id, kind, branch_id, is_active, sort_order);
create trigger directory_entries_set_updated_at
before update on public.directory_entries
for each row execute function public.set_updated_at();

insert into public.directory_entries (
  organization_id, kind, code, name, color, is_system, sort_order
)
select organization.id, seed.kind, seed.code, seed.name, seed.color, true, seed.sort_order
from public.organizations organization
cross join (values
  ('appointment_cancellation_reason', 'patient_request', 'По просьбе пациента', '#64748B', 10),
  ('appointment_cancellation_reason', 'doctor_unavailable', 'Врач недоступен', '#DC2626', 20),
  ('appointment_cancellation_reason', 'no_confirmation', 'Нет подтверждения', '#D97706', 30),
  ('expense_category', 'rent', 'Аренда', '#7C3AED', 10),
  ('expense_category', 'materials', 'Материалы', '#0284C7', 20),
  ('expense_category', 'salary', 'Заработная плата', '#059669', 30)
) seed(kind, code, name, color, sort_order)
on conflict do nothing;

create or replace function public.seed_default_directory_entries()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.directory_entries (
    organization_id, kind, code, name, color, is_system, sort_order
  ) values
    (new.id, 'appointment_cancellation_reason', 'patient_request', 'По просьбе пациента', '#64748B', true, 10),
    (new.id, 'appointment_cancellation_reason', 'doctor_unavailable', 'Врач недоступен', '#DC2626', true, 20),
    (new.id, 'appointment_cancellation_reason', 'no_confirmation', 'Нет подтверждения', '#D97706', true, 30),
    (new.id, 'expense_category', 'rent', 'Аренда', '#7C3AED', true, 10),
    (new.id, 'expense_category', 'materials', 'Материалы', '#0284C7', true, 20),
    (new.id, 'expense_category', 'salary', 'Заработная плата', '#059669', true, 30)
  on conflict do nothing;
  return new;
end;
$$;

create trigger organizations_seed_default_directory_entries
after insert on public.organizations
for each row execute function public.seed_default_directory_entries();

alter table public.directory_entries enable row level security;
grant select on public.directory_entries to authenticated;
create policy directory_entries_select on public.directory_entries
for select to authenticated
using (
  (branch_id is null or public.current_user_has_branch_access(organization_id, branch_id))
  and (
    public.current_user_has_permission(organization_id, 'directories.manage_global')
    or public.current_user_has_permission(organization_id, 'directories.manage_branch')
  )
);

create or replace function public.list_directory_entries(org_id uuid)
returns table (
  id uuid, kind text, code text, name text, color text, scope text,
  branch_id uuid, branch_name text, is_active boolean, is_system boolean,
  sort_order integer, usage_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select directory.*
  from (
  select entry.id, entry.kind, entry.code, entry.name, entry.color, entry.scope,
    entry.branch_id, branch.name as branch_name, entry.is_active, entry.is_system,
    entry.sort_order, 0::bigint
  from public.directory_entries entry
  left join public.branches branch
    on branch.organization_id = entry.organization_id and branch.id = entry.branch_id
  where entry.organization_id = org_id
    and (entry.branch_id is null or public.current_user_has_branch_access(org_id, entry.branch_id))
    and (public.current_user_has_permission(org_id, 'directories.manage_global')
      or public.current_user_has_permission(org_id, 'directories.manage_branch'))
  union all
  select specialization.id, 'specialization', 'specialization_' || replace(specialization.id::text, '-', ''),
    specialization.name, null, 'organization', null, null,
    specialization.is_active, specialization.is_system, 100,
    (select count(*) from public.doctors doctor
      where doctor.organization_id = org_id and doctor.specialization_id = specialization.id)
  from public.specializations specialization
  where specialization.organization_id = org_id
    and (public.current_user_has_permission(org_id, 'directories.manage_global')
      or public.current_user_has_permission(org_id, 'directories.manage_branch'))
  union all
  select room.id, 'room', 'room_' || replace(room.id::text, '-', ''), room.name, null, 'branch',
    room.branch_id, branch.name, room.is_active, false, 100,
    (select count(*) from public.doctor_branch_settings settings
      where settings.organization_id = org_id and settings.room_id = room.id)
  from public.rooms room
  join public.branches branch
    on branch.organization_id = room.organization_id and branch.id = room.branch_id
  where room.organization_id = org_id
    and public.current_user_has_branch_access(org_id, room.branch_id)
    and public.current_user_has_permission(org_id, 'directories.manage_branch')
  union all
  select source.id, 'patient_source', source.code, source.name, source.color,
    'organization', null, null, source.is_active, source.is_system, source.sort_order,
    (select count(*) from public.leads lead
      where lead.organization_id = org_id and lead.source_id = source.id)
  from public.patient_sources source
  where source.organization_id = org_id
    and (public.current_user_has_permission(org_id, 'directories.manage_global')
      or public.current_user_has_permission(org_id, 'directories.manage_branch'))
  union all
  select method.id, 'payment_method', method.code, method.name, null,
    'organization', null, null, method.is_active, method.is_system, 100,
    (select count(*) from public.payments payment
      where payment.organization_id = org_id and payment.payment_method_id = method.id)
  from public.payment_methods method
  where method.organization_id = org_id
    and (public.current_user_has_permission(org_id, 'directories.manage_global')
      or public.current_user_has_permission(org_id, 'directories.manage_branch'))
  union all
  select status.id, 'appointment_status', status.code, status.name, status.color,
    'organization', null, null, status.is_active, status.is_system, status.sort_order,
    (select count(*) from public.appointments appointment
      where appointment.organization_id = org_id and appointment.status_id = status.id)
  from public.appointment_statuses status
  where status.organization_id = org_id
    and (public.current_user_has_permission(org_id, 'directories.manage_global')
      or public.current_user_has_permission(org_id, 'directories.manage_branch'))
  union all
  select tag.id, 'patient_tag', 'tag_' || replace(tag.id::text, '-', ''), tag.name, tag.color,
    tag.scope, tag.branch_id, branch.name, tag.is_active, tag.is_system, 100,
    (select count(*) from public.patient_tag_assignments assignment
      where assignment.organization_id = org_id and assignment.tag_id = tag.id)
  from public.patient_tags tag
  left join public.branches branch
    on branch.organization_id = tag.organization_id and branch.id = tag.branch_id
  where tag.organization_id = org_id
    and (tag.branch_id is null or public.current_user_has_branch_access(org_id, tag.branch_id))
    and (public.current_user_has_permission(org_id, 'directories.manage_global')
      or public.current_user_has_permission(org_id, 'directories.manage_branch'))
  union all
  select category.id, 'service_category', 'category_' || replace(category.id::text, '-', ''),
    category.name, null, 'organization', null, null, category.is_active, false,
    category.sort_order,
    (select count(*) from public.services service
      where service.organization_id = org_id and service.category_id = category.id)
  from public.service_categories category
  where category.organization_id = org_id
    and (public.current_user_has_permission(org_id, 'directories.manage_global')
      or public.current_user_has_permission(org_id, 'directories.manage_branch'))
  ) directory
  order by directory.kind, directory.sort_order, directory.name;
$$;

create or replace function public.save_directory_entry(
  org_id uuid,
  target_entry_id uuid,
  entry_kind text,
  entry_code text,
  entry_name text,
  entry_color text,
  entry_scope text,
  entry_branch_id uuid,
  entry_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare saved_id uuid; normalized_code text; existing_is_system boolean;
begin
  if entry_kind not in ('employee_position', 'appointment_cancellation_reason', 'expense_category')
    or entry_scope not in ('organization', 'branch')
    or (entry_scope = 'organization' and entry_branch_id is not null)
    or (entry_scope = 'branch' and entry_branch_id is null)
    or char_length(trim(entry_name)) not between 2 and 160
    or entry_sort_order not between 0 and 10000
    or (entry_color is not null and entry_color !~ '^#[0-9A-Fa-f]{6}$')
  then raise exception 'Directory entry is invalid'; end if;

  if entry_scope = 'organization' then
    if not public.current_user_has_permission(org_id, 'directories.manage_global')
      or not public.current_user_has_all_branch_access(org_id)
    then raise exception 'Global directory permission required' using errcode = '42501'; end if;
  elsif not public.current_user_has_permission(org_id, 'directories.manage_branch')
    or not public.current_user_has_branch_access(org_id, entry_branch_id)
  then raise exception 'Branch directory permission required' using errcode = '42501'; end if;

  normalized_code := lower(trim(entry_code));
  if normalized_code !~ '^[a-z0-9_]{2,60}$' then raise exception 'Directory code is invalid'; end if;

  if target_entry_id is null then
    insert into public.directory_entries (
      organization_id, kind, code, name, color, scope, branch_id, sort_order
    ) values (
      org_id, entry_kind, normalized_code, trim(entry_name), entry_color,
      entry_scope, entry_branch_id, entry_sort_order
    ) returning id into saved_id;
  else
    select entry.is_system into existing_is_system
    from public.directory_entries entry
    where entry.organization_id = org_id and entry.id = target_entry_id and entry.kind = entry_kind;
    if existing_is_system is null then raise exception 'Directory entry not found'; end if;
    update public.directory_entries
    set code = case when existing_is_system then code else normalized_code end,
      name = trim(entry_name), color = entry_color, sort_order = entry_sort_order
    where organization_id = org_id and id = target_entry_id
    returning id into saved_id;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), case when target_entry_id is null then 'directory.created' else 'directory.updated' end,
    entry_kind, saved_id,
    jsonb_build_object('code', normalized_code, 'name', trim(entry_name),
      'scope', entry_scope, 'branch_id', entry_branch_id)
  );
  return saved_id;
end;
$$;

create or replace function public.set_directory_entry_active(
  org_id uuid,
  target_entry_id uuid,
  entry_kind text,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare entry_record public.directory_entries%rowtype;
begin
  select * into entry_record from public.directory_entries entry
  where entry.organization_id = org_id and entry.id = target_entry_id and entry.kind = entry_kind
  for update;
  if entry_record.id is null then raise exception 'Directory entry not found'; end if;
  if entry_record.is_system then raise exception 'System directory entry cannot be archived'; end if;
  if entry_record.scope = 'organization' then
    if not public.current_user_has_permission(org_id, 'directories.manage_global')
      or not public.current_user_has_all_branch_access(org_id)
    then raise exception 'Global directory permission required' using errcode = '42501'; end if;
  elsif not public.current_user_has_permission(org_id, 'directories.manage_branch')
    or not public.current_user_has_branch_access(org_id, entry_record.branch_id)
  then raise exception 'Branch directory permission required' using errcode = '42501'; end if;

  update public.directory_entries set is_active = target_is_active
  where organization_id = org_id and id = target_entry_id;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'directory.activity_changed', entry_kind, target_entry_id,
    jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

-- Extend the unified writer to native directory tables. System codes are never changed.
create or replace function public.save_directory_entry(
  org_id uuid, target_entry_id uuid, entry_kind text, entry_code text,
  entry_name text, entry_color text, entry_scope text, entry_branch_id uuid,
  entry_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare saved_id uuid; normalized_code text := lower(trim(entry_code)); system_entry boolean := false;
begin
  if entry_kind not in (
    'employee_position','appointment_cancellation_reason','expense_category',
    'specialization','room','patient_source','payment_method','appointment_status',
    'patient_tag','service_category'
  ) or entry_scope not in ('organization','branch')
    or (entry_scope = 'organization' and entry_branch_id is not null)
    or (entry_scope = 'branch' and entry_branch_id is null)
    or char_length(trim(entry_name)) not between 2 and 160
    or entry_sort_order not between 0 and 10000
    or (entry_color is not null and entry_color !~ '^#[0-9A-Fa-f]{6}$')
    or (entry_kind in ('service_category','specialization','patient_source','payment_method','appointment_status') and entry_scope <> 'organization')
    or (entry_kind = 'room' and entry_scope <> 'branch')
  then raise exception 'Directory entry is invalid'; end if;
  if normalized_code !~ '^[a-z0-9_]{2,60}$' then raise exception 'Directory code is invalid'; end if;

  if entry_scope = 'organization' then
    if not public.current_user_has_permission(org_id, 'directories.manage_global')
      or not public.current_user_has_all_branch_access(org_id)
    then raise exception 'Global directory permission required' using errcode = '42501'; end if;
  elsif not public.current_user_has_permission(org_id, 'directories.manage_branch')
    or not public.current_user_has_branch_access(org_id, entry_branch_id)
  then raise exception 'Branch directory permission required' using errcode = '42501'; end if;

  if entry_kind in ('employee_position','appointment_cancellation_reason','expense_category') then
    if target_entry_id is null then
      insert into public.directory_entries (organization_id, kind, code, name, color, scope, branch_id, sort_order)
      values (org_id, entry_kind, normalized_code, trim(entry_name), entry_color, entry_scope, entry_branch_id, entry_sort_order)
      returning id into saved_id;
    else
      select is_system into system_entry from public.directory_entries
      where organization_id = org_id and id = target_entry_id and kind = entry_kind;
      update public.directory_entries set
        code = case when system_entry then code else normalized_code end,
        name = trim(entry_name), color = entry_color, sort_order = entry_sort_order
      where organization_id = org_id and id = target_entry_id
        and scope = entry_scope and branch_id is not distinct from entry_branch_id
      returning id into saved_id;
    end if;
  elsif entry_kind = 'specialization' then
    if target_entry_id is null then
      insert into public.specializations (organization_id, name) values (org_id, trim(entry_name)) returning id into saved_id;
    else
      update public.specializations set name = trim(entry_name)
      where organization_id = org_id and id = target_entry_id returning id into saved_id;
    end if;
  elsif entry_kind = 'room' then
    if entry_scope <> 'branch' then raise exception 'Room must belong to a branch'; end if;
    if target_entry_id is null then
      insert into public.rooms (organization_id, branch_id, name)
      values (org_id, entry_branch_id, trim(entry_name)) returning id into saved_id;
    else
      update public.rooms set name = trim(entry_name)
      where organization_id = org_id and id = target_entry_id and branch_id = entry_branch_id returning id into saved_id;
    end if;
  elsif entry_kind = 'patient_source' then
    if target_entry_id is null then
      insert into public.patient_sources (organization_id, code, name, color, sort_order)
      values (org_id, normalized_code, trim(entry_name), coalesce(entry_color, '#64748B'), entry_sort_order)
      returning id into saved_id;
    else
      select is_system into system_entry from public.patient_sources where organization_id = org_id and id = target_entry_id;
      update public.patient_sources set code = case when system_entry then code else normalized_code end,
        name = trim(entry_name), color = coalesce(entry_color, color), sort_order = entry_sort_order
      where organization_id = org_id and id = target_entry_id returning id into saved_id;
    end if;
  elsif entry_kind = 'patient_tag' then
    if target_entry_id is null then
      insert into public.patient_tags (organization_id, name, color, scope, branch_id)
      values (org_id, trim(entry_name), entry_color, entry_scope, entry_branch_id) returning id into saved_id;
    else
      update public.patient_tags set name = trim(entry_name), color = entry_color
      where organization_id = org_id and id = target_entry_id
        and scope = entry_scope and branch_id is not distinct from entry_branch_id
      returning id into saved_id;
    end if;
  elsif entry_kind = 'service_category' then
    if target_entry_id is null then
      insert into public.service_categories (organization_id, name, sort_order)
      values (org_id, trim(entry_name), entry_sort_order) returning id into saved_id;
    else
      update public.service_categories set name = trim(entry_name), sort_order = entry_sort_order
      where organization_id = org_id and id = target_entry_id returning id into saved_id;
    end if;
  elsif entry_kind = 'payment_method' then
    if target_entry_id is null then raise exception 'Payment method codes are system controlled'; end if;
    update public.payment_methods set name = trim(entry_name)
    where organization_id = org_id and id = target_entry_id returning id into saved_id;
  elsif entry_kind = 'appointment_status' then
    if target_entry_id is null then raise exception 'Appointment status codes are system controlled'; end if;
    update public.appointment_statuses set name = trim(entry_name),
      color = coalesce(entry_color, color), sort_order = entry_sort_order
    where organization_id = org_id and id = target_entry_id returning id into saved_id;
  end if;

  if saved_id is null then raise exception 'Directory entry not found'; end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), case when target_entry_id is null then 'directory.created' else 'directory.updated' end,
    entry_kind, saved_id, jsonb_build_object('code', normalized_code, 'name', trim(entry_name),
      'scope', entry_scope, 'branch_id', entry_branch_id));
  return saved_id;
end;
$$;

create or replace function public.set_directory_entry_active(
  org_id uuid, target_entry_id uuid, entry_kind text, target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare entry_branch_id uuid; entry_is_system boolean := false; entry_found boolean := false;
begin
  if target_is_active is null then raise exception 'Directory activity is required'; end if;
  if entry_kind in ('employee_position','appointment_cancellation_reason','expense_category') then
    select branch_id, is_system, true into entry_branch_id, entry_is_system, entry_found
    from public.directory_entries where organization_id = org_id and id = target_entry_id and kind = entry_kind;
  elsif entry_kind = 'specialization' then
    select null, is_system, true into entry_branch_id, entry_is_system, entry_found from public.specializations where organization_id = org_id and id = target_entry_id;
  elsif entry_kind = 'room' then
    select branch_id, false, true into entry_branch_id, entry_is_system, entry_found from public.rooms where organization_id = org_id and id = target_entry_id;
  elsif entry_kind = 'patient_source' then
    select null, is_system, true into entry_branch_id, entry_is_system, entry_found from public.patient_sources where organization_id = org_id and id = target_entry_id;
  elsif entry_kind = 'payment_method' then
    select null, is_system, true into entry_branch_id, entry_is_system, entry_found from public.payment_methods where organization_id = org_id and id = target_entry_id;
  elsif entry_kind = 'appointment_status' then
    select null, is_system, true into entry_branch_id, entry_is_system, entry_found from public.appointment_statuses where organization_id = org_id and id = target_entry_id;
  elsif entry_kind = 'patient_tag' then
    select branch_id, is_system, true into entry_branch_id, entry_is_system, entry_found from public.patient_tags where organization_id = org_id and id = target_entry_id;
  elsif entry_kind = 'service_category' then
    select null, false, true into entry_branch_id, entry_is_system, entry_found from public.service_categories where organization_id = org_id and id = target_entry_id;
  end if;
  if not entry_found then raise exception 'Directory entry not found'; end if;
  if entry_is_system then raise exception 'System directory entry cannot be archived'; end if;
  if entry_branch_id is null then
    if not public.current_user_has_permission(org_id, 'directories.manage_global') or not public.current_user_has_all_branch_access(org_id)
    then raise exception 'Global directory permission required' using errcode = '42501'; end if;
  elsif not public.current_user_has_permission(org_id, 'directories.manage_branch') or not public.current_user_has_branch_access(org_id, entry_branch_id)
  then raise exception 'Branch directory permission required' using errcode = '42501'; end if;

  case entry_kind
    when 'employee_position' then update public.directory_entries set is_active = target_is_active where organization_id = org_id and id = target_entry_id;
    when 'appointment_cancellation_reason' then update public.directory_entries set is_active = target_is_active where organization_id = org_id and id = target_entry_id;
    when 'expense_category' then update public.directory_entries set is_active = target_is_active where organization_id = org_id and id = target_entry_id;
    when 'specialization' then update public.specializations set is_active = target_is_active where organization_id = org_id and id = target_entry_id;
    when 'room' then update public.rooms set is_active = target_is_active where organization_id = org_id and id = target_entry_id;
    when 'patient_source' then update public.patient_sources set is_active = target_is_active where organization_id = org_id and id = target_entry_id;
    when 'payment_method' then update public.payment_methods set is_active = target_is_active where organization_id = org_id and id = target_entry_id;
    when 'appointment_status' then update public.appointment_statuses set is_active = target_is_active where organization_id = org_id and id = target_entry_id;
    when 'patient_tag' then update public.patient_tags set is_active = target_is_active where organization_id = org_id and id = target_entry_id;
    when 'service_category' then update public.service_categories set is_active = target_is_active where organization_id = org_id and id = target_entry_id;
    else raise exception 'Directory kind is invalid';
  end case;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'directory.activity_changed', entry_kind, target_entry_id,
    jsonb_build_object('is_active', target_is_active));
end;
$$;

revoke all on function public.list_directory_entries(uuid) from public;
revoke all on function public.save_directory_entry(uuid, uuid, text, text, text, text, text, uuid, integer) from public;
revoke all on function public.set_directory_entry_active(uuid, uuid, text, boolean) from public;
grant execute on function public.list_directory_entries(uuid) to authenticated;
grant execute on function public.save_directory_entry(uuid, uuid, text, text, text, text, text, uuid, integer) to authenticated;
grant execute on function public.set_directory_entry_active(uuid, uuid, text, boolean) to authenticated;

commit;
