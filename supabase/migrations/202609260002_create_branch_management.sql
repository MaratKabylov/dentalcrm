begin;

create table public.branch_working_hours (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  is_working boolean not null default true,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, weekday),
  constraint branch_working_hours_branch_fkey
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete cascade,
  constraint branch_working_hours_time_check check (
    (is_working and start_time is not null and end_time > start_time)
    or (not is_working and start_time is null and end_time is null)
  )
);

create index branch_working_hours_organization_idx
  on public.branch_working_hours (organization_id, branch_id);

create trigger branch_working_hours_set_updated_at
before update on public.branch_working_hours
for each row execute function public.set_updated_at();

insert into public.branch_working_hours (
  organization_id, branch_id, weekday, is_working, start_time, end_time
)
select
  branch.organization_id,
  branch.id,
  weekday,
  weekday between 1 and 5,
  case when weekday between 1 and 5 then '09:00'::time else null end,
  case when weekday between 1 and 5 then '18:00'::time else null end
from public.branches branch
cross join generate_series(1, 7) weekday
on conflict do nothing;

alter table public.branch_working_hours enable row level security;
grant select on public.branch_working_hours to authenticated;

create policy branch_working_hours_select on public.branch_working_hours
for select to authenticated
using (
  public.current_user_has_branch_access(organization_id, branch_id)
  and (
    public.current_user_has_permission(organization_id, 'appointments.read')
    or public.current_user_has_permission(organization_id, 'branches.manage')
  )
);

drop policy if exists branches_select on public.branches;
drop policy if exists branches_insert on public.branches;
drop policy if exists branches_update on public.branches;
drop policy if exists branches_delete on public.branches;

create policy branches_select on public.branches
for select to authenticated
using (public.current_user_has_branch_access(organization_id, id));

create policy branches_insert on public.branches
for insert to authenticated
with check (
  public.current_user_has_permission(organization_id, 'branches.manage')
  and public.current_user_has_all_branch_access(organization_id)
);

create policy branches_update on public.branches
for update to authenticated
using (public.current_user_can_manage_branch(organization_id, id))
with check (public.current_user_can_manage_branch(organization_id, id));

create or replace function public.list_branches_for_management(org_id uuid)
returns table (
  id uuid,
  name text,
  address text,
  phone text,
  email text,
  timezone text,
  is_active boolean,
  rooms_count bigint,
  employees_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    branch.id,
    branch.name,
    branch.address,
    branch.phone,
    branch.email,
    branch.timezone,
    branch.is_active,
    (select count(*) from public.rooms room
      where room.organization_id = branch.organization_id
        and room.branch_id = branch.id
        and room.is_active),
    (select count(*) from public.employees employee
      where employee.organization_id = branch.organization_id
        and employee.branch_id = branch.id
        and employee.is_active)
  from public.branches branch
  where branch.organization_id = org_id
    and public.current_user_has_permission(org_id, 'branches.manage')
    and public.current_user_has_branch_access(org_id, branch.id)
  order by branch.is_active desc, branch.name;
$$;

create or replace function public.get_branch_for_management(
  org_id uuid,
  target_branch_id uuid
)
returns table (
  id uuid,
  name text,
  address text,
  phone text,
  email text,
  timezone text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    branch.id,
    branch.name,
    branch.address,
    branch.phone,
    branch.email,
    branch.timezone,
    branch.is_active
  from public.branches branch
  where branch.organization_id = org_id
    and branch.id = target_branch_id
    and public.current_user_can_manage_branch(org_id, target_branch_id);
$$;

create or replace function public.list_branch_working_hours_for_management(
  org_id uuid,
  target_branch_id uuid
)
returns table (
  weekday smallint,
  is_working boolean,
  start_time time,
  end_time time
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hours.weekday, hours.is_working, hours.start_time, hours.end_time
  from public.branch_working_hours hours
  where hours.organization_id = org_id
    and hours.branch_id = target_branch_id
    and public.current_user_can_manage_branch(org_id, target_branch_id)
  order by hours.weekday;
$$;

create or replace function public.list_branch_rooms_for_management(
  org_id uuid,
  target_branch_id uuid
)
returns table (
  id uuid,
  name text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select room.id, room.name, room.is_active
  from public.rooms room
  where room.organization_id = org_id
    and room.branch_id = target_branch_id
    and public.current_user_has_permission(org_id, 'directories.manage_branch')
    and public.current_user_has_branch_access(org_id, target_branch_id)
  order by room.is_active desc, room.name;
$$;

create or replace function public.list_branch_members_for_management(
  org_id uuid,
  target_branch_id uuid
)
returns table (
  membership_id uuid,
  user_id uuid,
  full_name text,
  email text,
  role_code text,
  role_name text,
  has_all_branch_access boolean,
  has_branch_access boolean,
  is_primary boolean
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'branch_access.manage')
    or not public.current_user_has_branch_access(org_id, target_branch_id)
  then
    raise exception 'Branch access manage permission required' using errcode = '42501';
  end if;

  return query
  select
    member.id,
    member.user_id,
    profile.full_name,
    auth_user.email::text,
    selected_role.code,
    selected_role.name,
    member.has_all_branch_access,
    member.has_all_branch_access or exists (
      select 1
      from public.member_branch_access access
      where access.organization_member_id = member.id
        and access.branch_id = target_branch_id
    ),
    member.primary_branch_id = target_branch_id
  from public.organization_members member
  join public.profiles profile on profile.id = member.user_id
  join auth.users auth_user on auth_user.id = member.user_id
  left join lateral (
    select role.code, role.name
    from public.member_roles member_role
    join public.roles role on role.id = member_role.role_id
    where member_role.organization_member_id = member.id
    order by
      case role.code when 'owner' then 1 when 'administrator' then 2 else 3 end,
      member_role.assigned_at
    limit 1
  ) selected_role on true
  where member.organization_id = org_id
    and member.status = 'active'
  order by lower(profile.full_name), lower(auth_user.email);
end;
$$;

create or replace function public.save_branch(
  org_id uuid,
  target_branch_id uuid,
  branch_name text,
  branch_address text,
  branch_phone text,
  branch_email text,
  branch_timezone text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_branch_id uuid;
  previous_data jsonb;
begin
  if branch_name is null or char_length(trim(branch_name)) not between 2 and 120 then
    raise exception 'Branch name is invalid';
  end if;
  if branch_address is not null and char_length(trim(branch_address)) > 500 then
    raise exception 'Branch address is invalid';
  end if;
  if branch_phone is not null and char_length(trim(branch_phone)) > 40 then
    raise exception 'Branch phone is invalid';
  end if;
  if nullif(trim(branch_email), '') is not null and (
    char_length(trim(branch_email)) > 200
    or trim(branch_email) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ) then
    raise exception 'Branch email is invalid';
  end if;
  if branch_timezone is null or not exists (
    select 1 from pg_timezone_names timezone where timezone.name = branch_timezone
  ) then
    raise exception 'Branch timezone is invalid';
  end if;

  if target_branch_id is null then
    if not public.current_user_has_permission(org_id, 'branches.manage')
      or not public.current_user_has_all_branch_access(org_id)
    then
      raise exception 'All-branch management access required' using errcode = '42501';
    end if;

    insert into public.branches (
      organization_id, name, address, phone, email, timezone
    ) values (
      org_id,
      trim(branch_name),
      nullif(trim(branch_address), ''),
      nullif(trim(branch_phone), ''),
      nullif(lower(trim(branch_email)), ''),
      branch_timezone
    ) returning id into saved_branch_id;

    insert into public.branch_working_hours (
      organization_id, branch_id, weekday, is_working, start_time, end_time
    )
    select
      org_id,
      saved_branch_id,
      weekday,
      weekday between 1 and 5,
      case when weekday between 1 and 5 then '09:00'::time else null end,
      case when weekday between 1 and 5 then '18:00'::time else null end
    from generate_series(1, 7) weekday;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      org_id,
      auth.uid(),
      'branch.created',
      'branch',
      saved_branch_id,
      jsonb_build_object('name', trim(branch_name), 'timezone', branch_timezone)
    );
  else
    if not public.current_user_can_manage_branch(org_id, target_branch_id) then
      raise exception 'Branch management access required' using errcode = '42501';
    end if;

    select to_jsonb(branch) into previous_data
    from public.branches branch
    where branch.organization_id = org_id and branch.id = target_branch_id
    for update;

    if previous_data is null then
      raise exception 'Branch not found';
    end if;

    update public.branches
    set
      name = trim(branch_name),
      address = nullif(trim(branch_address), ''),
      phone = nullif(trim(branch_phone), ''),
      email = nullif(lower(trim(branch_email)), ''),
      timezone = branch_timezone
    where organization_id = org_id and id = target_branch_id
    returning id into saved_branch_id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id,
      before_data, after_data
    )
    select
      org_id,
      auth.uid(),
      'branch.updated',
      'branch',
      branch.id,
      previous_data,
      to_jsonb(branch)
    from public.branches branch
    where branch.organization_id = org_id and branch.id = saved_branch_id;
  end if;

  return saved_branch_id;
end;
$$;

create or replace function public.set_branch_active(
  org_id uuid,
  target_branch_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_state boolean;
begin
  if target_is_active is null
    or not public.current_user_can_manage_branch(org_id, target_branch_id)
  then
    raise exception 'Branch management access required' using errcode = '42501';
  end if;

  select branch.is_active into previous_state
  from public.branches branch
  where branch.organization_id = org_id and branch.id = target_branch_id
  for update;

  if previous_state is null then
    raise exception 'Branch not found';
  end if;

  if not target_is_active and previous_state and not exists (
    select 1
    from public.branches branch
    where branch.organization_id = org_id
      and branch.id <> target_branch_id
      and branch.is_active
  ) then
    raise exception 'Organization must keep at least one active branch';
  end if;

  update public.branches
  set is_active = target_is_active
  where organization_id = org_id and id = target_branch_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    org_id,
    auth.uid(),
    case when target_is_active then 'branch.activated' else 'branch.archived' end,
    'branch',
    target_branch_id,
    jsonb_build_object('is_active', previous_state),
    jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

create or replace function public.set_branch_working_hours(
  org_id uuid,
  target_branch_id uuid,
  schedule jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_can_manage_branch(org_id, target_branch_id) then
    raise exception 'Branch management access required' using errcode = '42501';
  end if;
  if jsonb_typeof(schedule) <> 'array'
    or jsonb_array_length(schedule) <> 7
    or (
      select count(distinct (item ->> 'weekday')::smallint)
      from jsonb_array_elements(schedule) item
    ) <> 7
    or exists (
      select 1
      from jsonb_array_elements(schedule) item
      where (item ->> 'weekday')::smallint not between 1 and 7
        or not (item ? 'isWorking')
        or (
          (item ->> 'isWorking')::boolean
          and (
            nullif(item ->> 'startTime', '') is null
            or nullif(item ->> 'endTime', '') is null
            or (item ->> 'endTime')::time <= (item ->> 'startTime')::time
          )
        )
    )
  then
    raise exception 'Branch schedule is invalid';
  end if;

  delete from public.branch_working_hours
  where organization_id = org_id and branch_id = target_branch_id;

  insert into public.branch_working_hours (
    organization_id, branch_id, weekday, is_working, start_time, end_time
  )
  select
    org_id,
    target_branch_id,
    (item ->> 'weekday')::smallint,
    (item ->> 'isWorking')::boolean,
    case when (item ->> 'isWorking')::boolean
      then (item ->> 'startTime')::time else null end,
    case when (item ->> 'isWorking')::boolean
      then (item ->> 'endTime')::time else null end
  from jsonb_array_elements(schedule) item;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id,
    auth.uid(),
    'branch.schedule_updated',
    'branch',
    target_branch_id,
    jsonb_build_object('schedule', schedule)
  );
end;
$$;

create or replace function public.save_branch_room(
  org_id uuid,
  target_branch_id uuid,
  target_room_id uuid,
  room_name text,
  room_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_room_id uuid;
  previous_data jsonb;
begin
  if not public.current_user_has_permission(org_id, 'directories.manage_branch')
    or not public.current_user_has_branch_access(org_id, target_branch_id)
  then
    raise exception 'Branch directory management access required' using errcode = '42501';
  end if;
  if room_name is null or char_length(trim(room_name)) not between 1 and 100
    or room_is_active is null
  then
    raise exception 'Room data is invalid';
  end if;

  if target_room_id is null then
    insert into public.rooms (organization_id, branch_id, name, is_active)
    values (org_id, target_branch_id, trim(room_name), room_is_active)
    returning id into saved_room_id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      org_id,
      auth.uid(),
      'room.created',
      'room',
      saved_room_id,
      jsonb_build_object('branch_id', target_branch_id, 'name', trim(room_name))
    );
  else
    select to_jsonb(room) into previous_data
    from public.rooms room
    where room.organization_id = org_id
      and room.branch_id = target_branch_id
      and room.id = target_room_id
    for update;

    if previous_data is null then
      raise exception 'Room not found';
    end if;

    update public.rooms
    set name = trim(room_name), is_active = room_is_active
    where organization_id = org_id
      and branch_id = target_branch_id
      and id = target_room_id
    returning id into saved_room_id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id,
      before_data, after_data
    )
    select
      org_id,
      auth.uid(),
      'room.updated',
      'room',
      room.id,
      previous_data,
      to_jsonb(room)
    from public.rooms room
    where room.organization_id = org_id and room.id = saved_room_id;
  end if;

  return saved_room_id;
end;
$$;

create or replace function public.set_member_single_branch_access(
  org_id uuid,
  target_membership_id uuid,
  target_branch_id uuid,
  grant_access boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_member public.organization_members%rowtype;
  actor_is_owner boolean;
  target_is_owner boolean;
  replacement_primary_branch_id uuid;
begin
  if current_user_id is null
    or grant_access is null
    or not public.current_user_has_permission(org_id, 'branch_access.manage')
    or not public.current_user_has_branch_access(org_id, target_branch_id)
  then
    raise exception 'Branch access manage permission required' using errcode = '42501';
  end if;

  select * into target_member
  from public.organization_members member
  where member.organization_id = org_id
    and member.id = target_membership_id
    and member.status <> 'removed'
  for update;

  if target_member.id is null then
    raise exception 'Organization member not found';
  end if;

  select exists (
    select 1
    from public.organization_members member
    join public.member_roles member_role on member_role.organization_member_id = member.id
    join public.roles role on role.id = member_role.role_id
    where member.organization_id = org_id
      and member.user_id = current_user_id
      and member.status = 'active'
      and role.code = 'owner'
  ) into actor_is_owner;

  select exists (
    select 1
    from public.member_roles member_role
    join public.roles role on role.id = member_role.role_id
    where member_role.organization_member_id = target_membership_id
      and role.code = 'owner'
  ) into target_is_owner;

  if target_is_owner and not actor_is_owner then
    raise exception 'Only an owner can change owner branch access' using errcode = '42501';
  end if;

  if target_member.has_all_branch_access then
    if grant_access then
      return;
    end if;
    raise exception 'Switch member from all branches to selected branches first';
  end if;

  if grant_access then
    insert into public.member_branch_access (
      organization_id, organization_member_id, branch_id, granted_by
    ) values (
      org_id, target_membership_id, target_branch_id, current_user_id
    ) on conflict do nothing;

    if target_member.primary_branch_id is null then
      update public.organization_members
      set primary_branch_id = target_branch_id
      where id = target_membership_id;
    end if;
  else
    delete from public.member_branch_access
    where organization_id = org_id
      and organization_member_id = target_membership_id
      and branch_id = target_branch_id;

    if target_member.primary_branch_id = target_branch_id then
      select access.branch_id into replacement_primary_branch_id
      from public.member_branch_access access
      join public.branches branch
        on branch.organization_id = access.organization_id
        and branch.id = access.branch_id
      where access.organization_member_id = target_membership_id
      order by branch.is_active desc, branch.name
      limit 1;

      update public.organization_members
      set primary_branch_id = replacement_primary_branch_id
      where id = target_membership_id;
    end if;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id,
    current_user_id,
    case when grant_access then 'member.branch_granted' else 'member.branch_revoked' end,
    'organization_member',
    target_membership_id,
    jsonb_build_object('branch_id', target_branch_id)
  );
end;
$$;

revoke all on function public.list_branches_for_management(uuid) from public;
revoke all on function public.get_branch_for_management(uuid, uuid) from public;
revoke all on function public.list_branch_working_hours_for_management(uuid, uuid) from public;
revoke all on function public.list_branch_rooms_for_management(uuid, uuid) from public;
revoke all on function public.list_branch_members_for_management(uuid, uuid) from public;
revoke all on function public.save_branch(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.set_branch_active(uuid, uuid, boolean) from public;
revoke all on function public.set_branch_working_hours(uuid, uuid, jsonb) from public;
revoke all on function public.save_branch_room(uuid, uuid, uuid, text, boolean) from public;
revoke all on function public.set_member_single_branch_access(uuid, uuid, uuid, boolean) from public;

grant execute on function public.list_branches_for_management(uuid) to authenticated;
grant execute on function public.get_branch_for_management(uuid, uuid) to authenticated;
grant execute on function public.list_branch_working_hours_for_management(uuid, uuid) to authenticated;
grant execute on function public.list_branch_rooms_for_management(uuid, uuid) to authenticated;
grant execute on function public.list_branch_members_for_management(uuid, uuid) to authenticated;
grant execute on function public.save_branch(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.set_branch_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_branch_working_hours(uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_branch_room(uuid, uuid, uuid, text, boolean) to authenticated;
grant execute on function public.set_member_single_branch_access(uuid, uuid, uuid, boolean) to authenticated;

commit;
