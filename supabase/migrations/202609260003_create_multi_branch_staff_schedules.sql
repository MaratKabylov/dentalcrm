begin;

create table public.employee_branches (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  branch_id uuid not null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  primary key (employee_id, branch_id),
  constraint employee_branches_employee_fkey
    foreign key (organization_id, employee_id)
    references public.employees(organization_id, id) on delete cascade,
  constraint employee_branches_branch_fkey
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint employee_branches_unassigned_check check (
    (is_active and unassigned_at is null) or not is_active
  )
);

create unique index employee_branches_one_primary_idx
  on public.employee_branches (organization_id, employee_id)
  where is_primary and is_active;
create index employee_branches_branch_idx
  on public.employee_branches (organization_id, branch_id, is_active);

insert into public.employee_branches (
  organization_id, employee_id, branch_id, is_primary, is_active
)
select employee.organization_id, employee.id, employee.branch_id, true, employee.is_active
from public.employees employee
where employee.branch_id is not null
on conflict do nothing;

create table public.doctor_branch_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  doctor_id uuid not null,
  branch_id uuid not null,
  room_id uuid,
  appointment_duration_minutes integer not null default 30
    check (appointment_duration_minutes between 5 and 480),
  accepts_online_booking boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_branch_settings_doctor_fkey
    foreign key (organization_id, doctor_id)
    references public.doctors(organization_id, id) on delete cascade,
  constraint doctor_branch_settings_branch_fkey
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint doctor_branch_settings_room_fkey
    foreign key (organization_id, room_id)
    references public.rooms(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, doctor_id, branch_id)
);

create index doctor_branch_settings_branch_idx
  on public.doctor_branch_settings (organization_id, branch_id, is_active);
create trigger doctor_branch_settings_set_updated_at
before update on public.doctor_branch_settings
for each row execute function public.set_updated_at();

insert into public.doctor_branch_settings (
  organization_id, doctor_id, branch_id, room_id,
  appointment_duration_minutes, accepts_online_booking, is_active
)
select
  doctor.organization_id,
  doctor.id,
  employee.branch_id,
  doctor.room_id,
  doctor.appointment_duration_minutes,
  doctor.accepts_online_booking,
  doctor.is_active and employee.is_active
from public.doctors doctor
join public.employees employee
  on employee.organization_id = doctor.organization_id
  and employee.id = doctor.employee_id
where employee.branch_id is not null
on conflict do nothing;

create table public.doctor_branch_services (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  doctor_id uuid not null,
  branch_id uuid not null,
  service_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (doctor_id, branch_id, service_id),
  constraint doctor_branch_services_assignment_fkey
    foreign key (organization_id, doctor_id, branch_id)
    references public.doctor_branch_settings(organization_id, doctor_id, branch_id)
    on delete cascade,
  constraint doctor_branch_services_service_fkey
    foreign key (organization_id, service_id)
    references public.services(organization_id, id) on delete restrict
);

create index doctor_branch_services_lookup_idx
  on public.doctor_branch_services (organization_id, branch_id, service_id, is_active);
create trigger doctor_branch_services_set_updated_at
before update on public.doctor_branch_services
for each row execute function public.set_updated_at();

alter table public.doctor_schedule_exceptions
  add column branch_id uuid,
  add column is_active boolean not null default true;

update public.doctor_schedule_exceptions exception
set branch_id = coalesce(
  employee.branch_id,
  (
    select hours.branch_id
    from public.doctor_working_hours hours
    where hours.organization_id = exception.organization_id
      and hours.doctor_id = exception.doctor_id
    order by hours.valid_from, hours.branch_id
    limit 1
  )
)
from public.doctors doctor
join public.employees employee
  on employee.organization_id = doctor.organization_id
  and employee.id = doctor.employee_id
where doctor.organization_id = exception.organization_id
  and doctor.id = exception.doctor_id;

alter table public.doctor_schedule_exceptions
  add constraint doctor_schedule_exceptions_branch_fkey
  foreign key (organization_id, branch_id)
  references public.branches(organization_id, id) on delete restrict;

alter table public.doctor_schedule_exceptions
  alter column branch_id set not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.doctor_schedule_exceptions'::regclass
      and constraint_row.contype = 'u'
  loop
    execute format(
      'alter table public.doctor_schedule_exceptions drop constraint %I',
      constraint_name
    );
  end loop;
end;
$$;

create unique index doctor_schedule_exceptions_branch_unique_idx
  on public.doctor_schedule_exceptions (
    doctor_id, branch_id, exception_date, type, start_time
  ) nulls not distinct;
create index doctor_schedule_exceptions_branch_lookup_idx
  on public.doctor_schedule_exceptions (
    doctor_id, branch_id, exception_date, is_active
  );

create or replace function public.enforce_doctor_branch_room()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.room_id is not null and not exists (
    select 1
    from public.rooms room
    where room.organization_id = new.organization_id
      and room.id = new.room_id
      and room.branch_id = new.branch_id
      and room.is_active
  ) then
    raise exception 'Doctor room must belong to the selected branch';
  end if;
  return new;
end;
$$;

create trigger doctor_branch_settings_room_guard
before insert or update of organization_id, branch_id, room_id
on public.doctor_branch_settings
for each row execute function public.enforce_doctor_branch_room();

create or replace function public.enforce_doctor_working_hours_assignment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.doctor_branch_settings settings
    where settings.organization_id = new.organization_id
      and settings.doctor_id = new.doctor_id
      and settings.branch_id = new.branch_id
      and settings.is_active
  ) then
    raise exception 'Active doctor branch assignment is required';
  end if;

  if exists (
    select 1
    from public.doctor_working_hours hours
    where hours.organization_id = new.organization_id
      and hours.doctor_id = new.doctor_id
      and hours.weekday = new.weekday
      and hours.id <> new.id
      and daterange(
        hours.valid_from,
        coalesce(hours.valid_to, 'infinity'::date),
        '[]'
      ) && daterange(
        new.valid_from,
        coalesce(new.valid_to, 'infinity'::date),
        '[]'
      )
      and (hours.start_time, hours.end_time) overlaps (new.start_time, new.end_time)
  ) then
    raise exception 'Doctor working hours overlap another branch';
  end if;

  return new;
end;
$$;

create trigger doctor_working_hours_assignment_guard
before insert or update of organization_id, doctor_id, branch_id, weekday,
  start_time, end_time, valid_from, valid_to
on public.doctor_working_hours
for each row execute function public.enforce_doctor_working_hours_assignment();

alter table public.employee_branches enable row level security;
alter table public.doctor_branch_settings enable row level security;
alter table public.doctor_branch_services enable row level security;

grant select on public.employee_branches, public.doctor_branch_settings,
  public.doctor_branch_services to authenticated;

create policy employee_branches_select on public.employee_branches
for select to authenticated
using (
  public.current_user_has_branch_access(organization_id, branch_id)
  and (
    public.current_user_has_permission(organization_id, 'appointments.read')
    or public.current_user_has_permission(organization_id, 'users.manage')
  )
);

create policy doctor_branch_settings_select on public.doctor_branch_settings
for select to authenticated
using (
  public.current_user_has_branch_access(organization_id, branch_id)
  and public.current_user_has_permission(organization_id, 'appointments.read')
);

create policy doctor_branch_services_select on public.doctor_branch_services
for select to authenticated
using (
  public.current_user_has_branch_access(organization_id, branch_id)
  and (
    public.current_user_has_permission(organization_id, 'appointments.read')
    or public.current_user_has_permission(organization_id, 'clinical.read')
  )
);

drop policy if exists doctor_working_hours_select on public.doctor_working_hours;
create policy doctor_working_hours_select on public.doctor_working_hours
for select to authenticated
using (
  public.current_user_has_branch_access(organization_id, branch_id)
  and public.current_user_has_permission(organization_id, 'appointments.read')
);

drop policy if exists doctor_schedule_exceptions_select on public.doctor_schedule_exceptions;
create policy doctor_schedule_exceptions_select on public.doctor_schedule_exceptions
for select to authenticated
using (
  (branch_id is null or public.current_user_has_branch_access(organization_id, branch_id))
  and public.current_user_has_permission(organization_id, 'appointments.read')
);

drop function if exists public.list_doctor_options(uuid);
create function public.list_doctor_options(
  org_id uuid,
  target_branch_id uuid default null
)
returns table (
  id uuid,
  assignment_id uuid,
  full_name text,
  color text,
  specialization_name text,
  branch_id uuid,
  branch_name text,
  room_id uuid,
  room_name text,
  appointment_duration_minutes integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    doctor.id,
    settings.id,
    employee.full_name,
    coalesce(employee.color, '#087f6d'),
    specialization.name,
    settings.branch_id,
    branch.name,
    settings.room_id,
    room.name,
    settings.appointment_duration_minutes
  from public.doctors doctor
  join public.employees employee
    on employee.id = doctor.employee_id
    and employee.organization_id = doctor.organization_id
  join public.specializations specialization
    on specialization.id = doctor.specialization_id
    and specialization.organization_id = doctor.organization_id
  join public.doctor_branch_settings settings
    on settings.organization_id = doctor.organization_id
    and settings.doctor_id = doctor.id
    and settings.is_active
  join public.branches branch
    on branch.organization_id = settings.organization_id
    and branch.id = settings.branch_id
    and branch.is_active
  left join public.rooms room
    on room.organization_id = settings.organization_id
    and room.id = settings.room_id
  where doctor.organization_id = org_id
    and doctor.is_active
    and employee.is_active
    and (target_branch_id is null or settings.branch_id = target_branch_id)
    and public.current_user_has_permission(org_id, 'appointments.read')
    and public.current_user_has_branch_access(org_id, settings.branch_id)
  order by employee.full_name, branch.name;
$$;

create or replace function public.create_doctor_with_schedule(
  org_id uuid,
  doctor_branch_id uuid,
  doctor_full_name text,
  doctor_profile_id uuid,
  doctor_specialization text,
  doctor_room_name text,
  doctor_color text default '#087f6d',
  duration_minutes integer default 30,
  workday_start time default '09:00',
  workday_end time default '18:00'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_employee_id uuid;
  new_doctor_id uuid;
  selected_specialization_id uuid;
  selected_room_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'settings.manage')
    or not public.current_user_has_branch_access(org_id, doctor_branch_id)
  then
    raise exception 'Settings and branch access required' using errcode = '42501';
  end if;
  if char_length(trim(doctor_full_name)) not between 2 and 160
    or char_length(trim(doctor_specialization)) not between 2 and 100
    or char_length(trim(doctor_room_name)) not between 1 and 100
    or duration_minutes not between 5 and 480
    or workday_end <= workday_start
    or doctor_color !~ '^#[0-9A-Fa-f]{6}$'
  then
    raise exception 'Invalid doctor data';
  end if;
  if not exists (
    select 1 from public.branches branch
    where branch.id = doctor_branch_id
      and branch.organization_id = org_id
      and branch.is_active
  ) then
    raise exception 'Active branch not found';
  end if;

  select specialization.id into selected_specialization_id
  from public.specializations specialization
  where specialization.organization_id = org_id
    and lower(specialization.name) = lower(trim(doctor_specialization))
  limit 1;
  if selected_specialization_id is null then
    insert into public.specializations (organization_id, name)
    values (org_id, trim(doctor_specialization))
    returning id into selected_specialization_id;
  end if;

  select room.id into selected_room_id
  from public.rooms room
  where room.organization_id = org_id
    and room.branch_id = doctor_branch_id
    and lower(room.name) = lower(trim(doctor_room_name))
  limit 1;
  if selected_room_id is null then
    insert into public.rooms (organization_id, branch_id, name)
    values (org_id, doctor_branch_id, trim(doctor_room_name))
    returning id into selected_room_id;
  end if;

  insert into public.employees (
    organization_id, branch_id, profile_id, full_name, employee_type, color
  ) values (
    org_id, doctor_branch_id, doctor_profile_id, trim(doctor_full_name), 'doctor', doctor_color
  ) returning id into new_employee_id;

  insert into public.employee_branches (
    organization_id, employee_id, branch_id, is_primary
  ) values (org_id, new_employee_id, doctor_branch_id, true);

  insert into public.doctors (
    organization_id, employee_id, specialization_id, room_id,
    appointment_duration_minutes
  ) values (
    org_id, new_employee_id, selected_specialization_id, selected_room_id,
    duration_minutes
  ) returning id into new_doctor_id;

  insert into public.doctor_branch_settings (
    organization_id, doctor_id, branch_id, room_id,
    appointment_duration_minutes
  ) values (
    org_id, new_doctor_id, doctor_branch_id, selected_room_id, duration_minutes
  );

  insert into public.doctor_working_hours (
    organization_id, doctor_id, branch_id, weekday, start_time, end_time
  )
  select org_id, new_doctor_id, doctor_branch_id, weekday, workday_start, workday_end
  from generate_series(1, 5) weekday;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'doctor.created', 'doctor', new_doctor_id,
    jsonb_build_object(
      'full_name', trim(doctor_full_name),
      'specialization', trim(doctor_specialization),
      'branch_id', doctor_branch_id,
      'room_id', selected_room_id
    )
  );

  return new_doctor_id;
end;
$$;

create or replace function public.list_doctor_management(
  org_id uuid,
  target_doctor_id uuid
)
returns table (
  id uuid,
  employee_id uuid,
  full_name text,
  color text,
  specialization_name text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select doctor.id, employee.id, employee.full_name,
    coalesce(employee.color, '#087f6d'), specialization.name,
    doctor.is_active and employee.is_active
  from public.doctors doctor
  join public.employees employee
    on employee.organization_id = doctor.organization_id
    and employee.id = doctor.employee_id
  join public.specializations specialization
    on specialization.organization_id = doctor.organization_id
    and specialization.id = doctor.specialization_id
  where doctor.organization_id = org_id
    and doctor.id = target_doctor_id
    and public.current_user_has_permission(org_id, 'settings.manage')
    and exists (
      select 1
      from public.doctor_branch_settings settings
      where settings.organization_id = org_id
        and settings.doctor_id = doctor.id
        and public.current_user_has_branch_access(org_id, settings.branch_id)
    );
$$;

create or replace function public.list_doctor_branch_management(
  org_id uuid,
  target_doctor_id uuid
)
returns table (
  assignment_id uuid,
  branch_id uuid,
  branch_name text,
  room_name text,
  appointment_duration_minutes integer,
  accepts_online_booking boolean,
  is_active boolean,
  working_hours jsonb,
  service_ids uuid[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    settings.id,
    settings.branch_id,
    branch.name,
    room.name,
    settings.appointment_duration_minutes,
    settings.accepts_online_booking,
    settings.is_active,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', hours.weekday,
        'startTime', to_char(hours.start_time, 'HH24:MI'),
        'endTime', to_char(hours.end_time, 'HH24:MI')
      ) order by hours.weekday)
      from public.doctor_working_hours hours
      where hours.organization_id = settings.organization_id
        and hours.doctor_id = settings.doctor_id
        and hours.branch_id = settings.branch_id
        and current_date >= hours.valid_from
        and (hours.valid_to is null or current_date <= hours.valid_to)
    ), '[]'::jsonb),
    coalesce((
      select array_agg(link.service_id order by link.service_id)
      from public.doctor_branch_services link
      where link.organization_id = settings.organization_id
        and link.doctor_id = settings.doctor_id
        and link.branch_id = settings.branch_id
        and link.is_active
    ), array[]::uuid[])
  from public.doctor_branch_settings settings
  join public.branches branch
    on branch.organization_id = settings.organization_id
    and branch.id = settings.branch_id
  left join public.rooms room
    on room.organization_id = settings.organization_id
    and room.id = settings.room_id
  where settings.organization_id = org_id
    and settings.doctor_id = target_doctor_id
    and public.current_user_has_permission(org_id, 'settings.manage')
    and public.current_user_has_branch_access(org_id, settings.branch_id)
  order by settings.is_active desc, branch.name;
$$;

create or replace function public.list_doctor_schedule_exceptions_management(
  org_id uuid,
  target_doctor_id uuid
)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  exception_date date,
  type text,
  start_time time,
  end_time time,
  reason text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exception.id, exception.branch_id, branch.name,
    exception.exception_date, exception.type, exception.start_time,
    exception.end_time, exception.reason, exception.is_active
  from public.doctor_schedule_exceptions exception
  join public.branches branch
    on branch.organization_id = exception.organization_id
    and branch.id = exception.branch_id
  where exception.organization_id = org_id
    and exception.doctor_id = target_doctor_id
    and public.current_user_has_permission(org_id, 'settings.manage')
    and public.current_user_has_branch_access(org_id, exception.branch_id)
  order by exception.is_active desc, exception.exception_date desc, exception.created_at desc;
$$;

create or replace function public.save_doctor_branch_assignment(
  org_id uuid,
  target_doctor_id uuid,
  target_branch_id uuid,
  doctor_room_name text,
  duration_minutes integer,
  allow_online_booking boolean,
  schedule jsonb,
  allowed_service_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_employee_id uuid;
  selected_room_id uuid;
  saved_assignment_id uuid;
  normalized_service_ids uuid[] := coalesce(allowed_service_ids, array[]::uuid[]);
  has_primary_assignment boolean;
begin
  if not public.current_user_has_permission(org_id, 'settings.manage')
    or not public.current_user_has_branch_access(org_id, target_branch_id)
  then
    raise exception 'Settings and branch access required' using errcode = '42501';
  end if;
  if char_length(trim(doctor_room_name)) not between 1 and 100
    or duration_minutes not between 5 and 480
    or allow_online_booking is null
  then
    raise exception 'Doctor branch settings are invalid';
  end if;
  if jsonb_typeof(schedule) <> 'array' or jsonb_array_length(schedule) <> 7
    or (select count(distinct (item ->> 'weekday')::smallint) from jsonb_array_elements(schedule) item) <> 7
    or exists (
      select 1 from jsonb_array_elements(schedule) item
      where (item ->> 'weekday')::smallint not between 1 and 7
        or not (item ? 'isWorking')
        or ((item ->> 'isWorking')::boolean and (
          nullif(item ->> 'startTime', '') is null
          or nullif(item ->> 'endTime', '') is null
          or (item ->> 'endTime')::time <= (item ->> 'startTime')::time
        ))
    )
  then
    raise exception 'Doctor schedule is invalid';
  end if;
  if not exists (
    select 1 from public.branches branch
    where branch.organization_id = org_id
      and branch.id = target_branch_id
      and branch.is_active
  ) then
    raise exception 'Active branch not found';
  end if;

  select doctor.employee_id into target_employee_id
  from public.doctors doctor
  join public.employees employee
    on employee.organization_id = doctor.organization_id
    and employee.id = doctor.employee_id
  where doctor.organization_id = org_id
    and doctor.id = target_doctor_id
    and doctor.is_active
    and employee.is_active
  for update of doctor, employee;
  if target_employee_id is null then
    raise exception 'Active doctor not found';
  end if;

  if exists (
    select 1 from unnest(normalized_service_ids) requested(service_id)
    where not exists (
      select 1 from public.services service
      where service.organization_id = org_id
        and service.id = requested.service_id
        and service.is_active
    )
  ) then
    raise exception 'One or more services are unavailable';
  end if;

  select room.id into selected_room_id
  from public.rooms room
  where room.organization_id = org_id
    and room.branch_id = target_branch_id
    and lower(room.name) = lower(trim(doctor_room_name))
  limit 1;
  if selected_room_id is null then
    insert into public.rooms (organization_id, branch_id, name)
    values (org_id, target_branch_id, trim(doctor_room_name))
    returning id into selected_room_id;
  end if;

  select exists (
    select 1 from public.employee_branches assignment
    where assignment.organization_id = org_id
      and assignment.employee_id = target_employee_id
      and assignment.is_primary
      and assignment.is_active
  ) into has_primary_assignment;

  insert into public.employee_branches (
    organization_id, employee_id, branch_id, is_primary, is_active
  ) values (
    org_id, target_employee_id, target_branch_id, not has_primary_assignment, true
  )
  on conflict (employee_id, branch_id) do update
  set is_active = true,
      unassigned_at = null,
      is_primary = case
        when not has_primary_assignment then true
        else employee_branches.is_primary
      end;

  insert into public.doctor_branch_settings (
    organization_id, doctor_id, branch_id, room_id,
    appointment_duration_minutes, accepts_online_booking, is_active
  ) values (
    org_id, target_doctor_id, target_branch_id, selected_room_id,
    duration_minutes, allow_online_booking, true
  )
  on conflict (organization_id, doctor_id, branch_id) do update
  set room_id = excluded.room_id,
      appointment_duration_minutes = excluded.appointment_duration_minutes,
      accepts_online_booking = excluded.accepts_online_booking,
      is_active = true
  returning id into saved_assignment_id;

  delete from public.doctor_working_hours
  where organization_id = org_id
    and doctor_id = target_doctor_id
    and branch_id = target_branch_id;

  insert into public.doctor_working_hours (
    organization_id, doctor_id, branch_id, weekday, start_time, end_time
  )
  select org_id, target_doctor_id, target_branch_id,
    (item ->> 'weekday')::smallint,
    (item ->> 'startTime')::time,
    (item ->> 'endTime')::time
  from jsonb_array_elements(schedule) item
  where (item ->> 'isWorking')::boolean;

  update public.doctor_branch_services
  set is_active = (service_id = any(normalized_service_ids))
  where organization_id = org_id
    and doctor_id = target_doctor_id
    and branch_id = target_branch_id;

  insert into public.doctor_branch_services (
    organization_id, doctor_id, branch_id, service_id, is_active
  )
  select org_id, target_doctor_id, target_branch_id, requested.service_id, true
  from unnest(normalized_service_ids) requested(service_id)
  on conflict (doctor_id, branch_id, service_id) do update set is_active = true;

  update public.employees
  set branch_id = coalesce(branch_id, target_branch_id)
  where organization_id = org_id and id = target_employee_id;

  if exists (
    select 1 from public.employee_branches assignment
    where assignment.employee_id = target_employee_id
      and assignment.branch_id = target_branch_id
      and assignment.is_primary
  ) then
    update public.doctors
    set room_id = selected_room_id,
        appointment_duration_minutes = duration_minutes,
        accepts_online_booking = allow_online_booking
    where organization_id = org_id and id = target_doctor_id;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'doctor.branch_assignment_saved', 'doctor', target_doctor_id,
    jsonb_build_object(
      'branch_id', target_branch_id,
      'room_id', selected_room_id,
      'duration_minutes', duration_minutes,
      'service_ids', to_jsonb(normalized_service_ids)
    )
  );

  return saved_assignment_id;
end;
$$;

create or replace function public.set_doctor_branch_assignment_active(
  org_id uuid,
  target_doctor_id uuid,
  target_branch_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_employee_id uuid;
begin
  if target_is_active is null
    or not public.current_user_has_permission(org_id, 'settings.manage')
    or not public.current_user_has_branch_access(org_id, target_branch_id)
  then
    raise exception 'Settings and branch access required' using errcode = '42501';
  end if;

  select doctor.employee_id into target_employee_id
  from public.doctors doctor
  where doctor.organization_id = org_id and doctor.id = target_doctor_id;
  if target_employee_id is null then raise exception 'Doctor not found'; end if;

  if not target_is_active and exists (
    select 1 from public.appointments appointment
    where appointment.organization_id = org_id
      and appointment.doctor_id = target_doctor_id
      and appointment.branch_id = target_branch_id
      and appointment.start_at >= now()
      and appointment.cancelled_at is null
  ) then
    raise exception 'Branch assignment has future appointments';
  end if;

  update public.doctor_branch_settings
  set is_active = target_is_active
  where organization_id = org_id
    and doctor_id = target_doctor_id
    and branch_id = target_branch_id;
  if not found then raise exception 'Doctor branch assignment not found'; end if;

  update public.employee_branches
  set is_active = target_is_active,
      unassigned_at = case when target_is_active then null else now() end,
      is_primary = case when target_is_active then is_primary else false end
  where organization_id = org_id
    and employee_id = target_employee_id
    and branch_id = target_branch_id;

  if not target_is_active and not exists (
    select 1 from public.employee_branches assignment
    where assignment.organization_id = org_id
      and assignment.employee_id = target_employee_id
      and assignment.is_primary and assignment.is_active
  ) then
    update public.employee_branches assignment
    set is_primary = true
    where assignment.organization_id = org_id
      and assignment.employee_id = target_employee_id
      and assignment.branch_id = (
        select replacement.branch_id
        from public.employee_branches replacement
        join public.branches branch
          on branch.organization_id = replacement.organization_id
          and branch.id = replacement.branch_id
        where replacement.organization_id = org_id
          and replacement.employee_id = target_employee_id
          and replacement.is_active
        order by branch.name
        limit 1
      );
  end if;

  if target_is_active and not exists (
    select 1 from public.employee_branches assignment
    where assignment.organization_id = org_id
      and assignment.employee_id = target_employee_id
      and assignment.is_primary and assignment.is_active
  ) then
    update public.employee_branches
    set is_primary = true
    where organization_id = org_id
      and employee_id = target_employee_id
      and branch_id = target_branch_id;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(),
    case when target_is_active then 'doctor.branch_assignment_activated' else 'doctor.branch_assignment_archived' end,
    'doctor', target_doctor_id,
    jsonb_build_object('branch_id', target_branch_id, 'is_active', target_is_active)
  );
end;
$$;

create or replace function public.save_doctor_schedule_exception(
  org_id uuid,
  target_doctor_id uuid,
  target_branch_id uuid,
  target_date date,
  exception_type text,
  exception_start_time time,
  exception_end_time time,
  exception_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare saved_exception_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'settings.manage')
    or not public.current_user_has_branch_access(org_id, target_branch_id)
  then raise exception 'Settings and branch access required' using errcode = '42501'; end if;
  if target_date is null or exception_type not in ('day_off', 'sick_leave', 'vacation', 'custom_hours', 'blocked')
    or (exception_type = 'custom_hours' and (
      exception_start_time is null or exception_end_time <= exception_start_time
    ))
  then raise exception 'Schedule exception is invalid'; end if;
  if not exists (
    select 1 from public.doctor_branch_settings settings
    where settings.organization_id = org_id
      and settings.doctor_id = target_doctor_id
      and settings.branch_id = target_branch_id
      and settings.is_active
  ) then raise exception 'Active doctor branch assignment not found'; end if;

  insert into public.doctor_schedule_exceptions (
    organization_id, doctor_id, branch_id, exception_date, type,
    start_time, end_time, reason, is_active
  ) values (
    org_id, target_doctor_id, target_branch_id, target_date, exception_type,
    case when exception_type = 'custom_hours' then exception_start_time end,
    case when exception_type = 'custom_hours' then exception_end_time end,
    nullif(trim(exception_reason), ''), true
  ) returning id into saved_exception_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'doctor.schedule_exception_created',
    'doctor_schedule_exception', saved_exception_id,
    jsonb_build_object('doctor_id', target_doctor_id, 'branch_id', target_branch_id,
      'date', target_date, 'type', exception_type)
  );
  return saved_exception_id;
end;
$$;

create or replace function public.set_doctor_schedule_exception_active(
  org_id uuid,
  target_exception_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare exception_branch_id uuid;
begin
  select exception.branch_id into exception_branch_id
  from public.doctor_schedule_exceptions exception
  where exception.organization_id = org_id and exception.id = target_exception_id;
  if exception_branch_id is null
    or target_is_active is null
    or not public.current_user_has_permission(org_id, 'settings.manage')
    or not public.current_user_has_branch_access(org_id, exception_branch_id)
  then raise exception 'Schedule exception access required' using errcode = '42501'; end if;

  update public.doctor_schedule_exceptions
  set is_active = target_is_active
  where organization_id = org_id and id = target_exception_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'doctor.schedule_exception_activity_changed',
    'doctor_schedule_exception', target_exception_id,
    jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

create or replace function public.create_appointment(
  org_id uuid,
  appointment_branch_id uuid,
  appointment_patient_id uuid,
  appointment_doctor_id uuid,
  appointment_date date,
  appointment_start_time time,
  appointment_room_id uuid default null,
  duration_minutes integer default null,
  appointment_reason text default null,
  appointment_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_appointment_id uuid;
  selected_status_id uuid;
  selected_room_id uuid;
  selected_duration integer;
  branch_timezone text;
  calculated_start_at timestamptz;
  calculated_end_at timestamptz;
  weekday_number smallint;
begin
  if not public.current_user_has_permission(org_id, 'appointments.manage')
    or not public.current_user_has_branch_access(org_id, appointment_branch_id)
  then raise exception 'Appointment branch access required' using errcode = '42501'; end if;

  select branch.timezone into branch_timezone
  from public.branches branch
  where branch.id = appointment_branch_id
    and branch.organization_id = org_id
    and branch.is_active;
  if branch_timezone is null then raise exception 'Active branch not found'; end if;
  if appointment_date < (now() at time zone branch_timezone)::date then
    raise exception 'Appointments cannot be created in the past';
  end if;
  if not exists (
    select 1 from public.patients patient
    where patient.id = appointment_patient_id
      and patient.organization_id = org_id
      and patient.archived_at is null
  ) then raise exception 'Active patient not found'; end if;

  select coalesce(appointment_room_id, settings.room_id),
    coalesce(duration_minutes, settings.appointment_duration_minutes)
  into selected_room_id, selected_duration
  from public.doctor_branch_settings settings
  join public.doctors doctor
    on doctor.organization_id = settings.organization_id
    and doctor.id = settings.doctor_id
  join public.employees employee
    on employee.organization_id = doctor.organization_id
    and employee.id = doctor.employee_id
  where settings.organization_id = org_id
    and settings.doctor_id = appointment_doctor_id
    and settings.branch_id = appointment_branch_id
    and settings.is_active and doctor.is_active and employee.is_active;

  if selected_duration is null or selected_duration not between 5 and 480 then
    raise exception 'Active doctor branch assignment not found or duration is invalid';
  end if;
  if selected_room_id is not null and not exists (
    select 1 from public.rooms room
    where room.id = selected_room_id
      and room.organization_id = org_id
      and room.branch_id = appointment_branch_id
      and room.is_active
  ) then raise exception 'Active room in the selected branch not found'; end if;

  calculated_start_at := (appointment_date + appointment_start_time) at time zone branch_timezone;
  calculated_end_at := calculated_start_at + make_interval(mins => selected_duration);
  weekday_number := extract(isodow from appointment_date)::smallint;

  if not exists (
    select 1 from public.doctor_working_hours hours
    where hours.organization_id = org_id
      and hours.doctor_id = appointment_doctor_id
      and hours.branch_id = appointment_branch_id
      and hours.weekday = weekday_number
      and appointment_date >= hours.valid_from
      and (hours.valid_to is null or appointment_date <= hours.valid_to)
      and appointment_start_time >= hours.start_time
      and appointment_start_time + make_interval(mins => selected_duration) <= hours.end_time
  ) then raise exception 'Appointment is outside doctor working hours'; end if;

  if exists (
    select 1 from public.doctor_schedule_exceptions exception
    where exception.organization_id = org_id
      and exception.doctor_id = appointment_doctor_id
      and exception.branch_id = appointment_branch_id
      and exception.exception_date = appointment_date
      and exception.is_active
      and exception.type in ('day_off', 'sick_leave', 'vacation', 'blocked')
  ) or (
    exists (
      select 1 from public.doctor_schedule_exceptions exception
      where exception.organization_id = org_id
        and exception.doctor_id = appointment_doctor_id
        and exception.branch_id = appointment_branch_id
        and exception.exception_date = appointment_date
        and exception.is_active and exception.type = 'custom_hours'
    )
    and not exists (
      select 1 from public.doctor_schedule_exceptions exception
      where exception.organization_id = org_id
        and exception.doctor_id = appointment_doctor_id
        and exception.branch_id = appointment_branch_id
        and exception.exception_date = appointment_date
        and exception.is_active and exception.type = 'custom_hours'
        and appointment_start_time >= exception.start_time
        and appointment_start_time + make_interval(mins => selected_duration) <= exception.end_time
    )
  ) then raise exception 'Doctor is unavailable at the selected time'; end if;

  select status.id into selected_status_id
  from public.appointment_statuses status
  where status.organization_id = org_id and status.code = 'unconfirmed';
  if selected_status_id is null then raise exception 'Initial appointment status is not configured'; end if;

  insert into public.appointments (
    organization_id, branch_id, patient_id, doctor_id, room_id,
    start_at, end_at, status_id, reason, notes, created_by
  ) values (
    org_id, appointment_branch_id, appointment_patient_id, appointment_doctor_id,
    selected_room_id, calculated_start_at, calculated_end_at, selected_status_id,
    nullif(trim(appointment_reason), ''), nullif(trim(appointment_notes), ''), auth.uid()
  ) returning id into new_appointment_id;

  insert into public.appointment_status_history (
    organization_id, appointment_id, from_status_id, to_status_id, changed_by
  ) values (org_id, new_appointment_id, null, selected_status_id, auth.uid());

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'appointment.created', 'appointment', new_appointment_id,
    jsonb_build_object('patient_id', appointment_patient_id, 'doctor_id', appointment_doctor_id,
      'branch_id', appointment_branch_id, 'start_at', calculated_start_at, 'end_at', calculated_end_at)
  );
  return new_appointment_id;
exception when exclusion_violation then
  raise exception 'Doctor or room already has an appointment at this time' using errcode = '23P01';
end;
$$;

drop function if exists public.list_calendar_appointments(uuid, date, date);
create function public.list_calendar_appointments(
  org_id uuid,
  date_from date,
  date_to date,
  target_branch_id uuid default null
)
returns table (
  id uuid, branch_id uuid, branch_name text, patient_id uuid, patient_name text,
  patient_phone text, doctor_id uuid, doctor_name text, doctor_color text,
  room_name text, start_at timestamptz, end_at timestamptz, status_code text,
  status_name text, status_color text, reason text, notes text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select appointment.id, appointment.branch_id, branch.name, appointment.patient_id,
    trim(patient.last_name || ' ' || patient.first_name || ' ' || coalesce(patient.middle_name, '')),
    patient.phone, appointment.doctor_id, employee.full_name,
    coalesce(employee.color, '#087f6d'), room.name, appointment.start_at,
    appointment.end_at, status.code, status.name, status.color,
    appointment.reason, appointment.notes
  from public.appointments appointment
  join public.branches branch
    on branch.id = appointment.branch_id and branch.organization_id = appointment.organization_id
  join public.patients patient
    on patient.id = appointment.patient_id and patient.organization_id = appointment.organization_id
  join public.doctors doctor
    on doctor.id = appointment.doctor_id and doctor.organization_id = appointment.organization_id
  join public.employees employee
    on employee.id = doctor.employee_id and employee.organization_id = appointment.organization_id
  join public.appointment_statuses status
    on status.id = appointment.status_id and status.organization_id = appointment.organization_id
  left join public.rooms room
    on room.id = appointment.room_id and room.organization_id = appointment.organization_id
  where appointment.organization_id = org_id
    and public.current_user_has_permission(org_id, 'appointments.read')
    and public.current_user_has_branch_access(org_id, appointment.branch_id)
    and (target_branch_id is null or appointment.branch_id = target_branch_id)
    and appointment.start_at >= (date_from::timestamp at time zone branch.timezone)
    and appointment.start_at < ((date_to + 1)::timestamp at time zone branch.timezone)
  order by appointment.start_at, employee.full_name;
$$;

create or replace function public.list_branches_for_management(org_id uuid)
returns table (
  id uuid, name text, address text, phone text, email text, timezone text,
  is_active boolean, rooms_count bigint, employees_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select branch.id, branch.name, branch.address, branch.phone, branch.email,
    branch.timezone, branch.is_active,
    (select count(*) from public.rooms room
      where room.organization_id = branch.organization_id
        and room.branch_id = branch.id and room.is_active),
    (select count(*) from public.employee_branches assignment
      where assignment.organization_id = branch.organization_id
        and assignment.branch_id = branch.id and assignment.is_active)
  from public.branches branch
  where branch.organization_id = org_id
    and public.current_user_has_permission(org_id, 'branches.manage')
    and public.current_user_has_branch_access(org_id, branch.id)
  order by branch.is_active desc, branch.name;
$$;

revoke all on function public.list_doctor_options(uuid, uuid) from public;
revoke all on function public.list_doctor_management(uuid, uuid) from public;
revoke all on function public.list_doctor_branch_management(uuid, uuid) from public;
revoke all on function public.list_doctor_schedule_exceptions_management(uuid, uuid) from public;
revoke all on function public.save_doctor_branch_assignment(uuid, uuid, uuid, text, integer, boolean, jsonb, uuid[]) from public;
revoke all on function public.set_doctor_branch_assignment_active(uuid, uuid, uuid, boolean) from public;
revoke all on function public.save_doctor_schedule_exception(uuid, uuid, uuid, date, text, time, time, text) from public;
revoke all on function public.set_doctor_schedule_exception_active(uuid, uuid, boolean) from public;
revoke all on function public.list_calendar_appointments(uuid, date, date, uuid) from public;

grant execute on function public.list_doctor_options(uuid, uuid) to authenticated;
grant execute on function public.list_doctor_management(uuid, uuid) to authenticated;
grant execute on function public.list_doctor_branch_management(uuid, uuid) to authenticated;
grant execute on function public.list_doctor_schedule_exceptions_management(uuid, uuid) to authenticated;
grant execute on function public.save_doctor_branch_assignment(uuid, uuid, uuid, text, integer, boolean, jsonb, uuid[]) to authenticated;
grant execute on function public.set_doctor_branch_assignment_active(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.save_doctor_schedule_exception(uuid, uuid, uuid, date, text, time, time, text) to authenticated;
grant execute on function public.set_doctor_schedule_exception_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_calendar_appointments(uuid, date, date, uuid) to authenticated;

comment on column public.employees.branch_id is
  'Legacy primary branch snapshot. Use employee_branches for branch assignments.';
comment on column public.doctors.room_id is
  'Legacy primary branch snapshot. Use doctor_branch_settings for branch rooms.';
comment on column public.doctors.appointment_duration_minutes is
  'Legacy primary branch snapshot. Use doctor_branch_settings for branch duration.';

commit;
