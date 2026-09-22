create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, branch_id, name)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid,
  profile_id uuid references public.profiles(id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  phone text,
  email text,
  employee_type text not null check (employee_type in (
    'doctor', 'assistant', 'receptionist', 'cashier', 'administrator', 'other'
  )),
  hire_date date not null default current_date,
  termination_date date,
  is_active boolean not null default true,
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint employees_dates_check check (
    termination_date is null or termination_date >= hire_date
  ),
  unique (organization_id, id)
);

create table public.specializations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 100),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  specialization_id uuid not null,
  room_id uuid,
  appointment_duration_minutes integer not null default 30
    check (appointment_duration_minutes between 5 and 480),
  accepts_online_booking boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctors_employee_fkey foreign key (organization_id, employee_id)
    references public.employees(organization_id, id) on delete restrict,
  constraint doctors_specialization_fkey foreign key (organization_id, specialization_id)
    references public.specializations(organization_id, id) on delete restrict,
  constraint doctors_room_fkey foreign key (organization_id, room_id)
    references public.rooms(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (employee_id)
);

alter table public.organization_members
  add constraint organization_members_employee_fkey
  foreign key (organization_id, employee_id)
  references public.employees(organization_id, id) on delete set null (employee_id);

create table public.doctor_working_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  doctor_id uuid not null,
  branch_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  constraint doctor_working_hours_doctor_fkey foreign key (organization_id, doctor_id)
    references public.doctors(organization_id, id) on delete cascade,
  constraint doctor_working_hours_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint doctor_working_hours_time_check check (end_time > start_time),
  constraint doctor_working_hours_dates_check check (valid_to is null or valid_to >= valid_from),
  unique (doctor_id, branch_id, weekday, valid_from)
);

create table public.doctor_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  doctor_id uuid not null,
  exception_date date not null,
  type text not null check (type in ('day_off', 'sick_leave', 'vacation', 'custom_hours', 'blocked')),
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now(),
  constraint doctor_schedule_exceptions_doctor_fkey foreign key (organization_id, doctor_id)
    references public.doctors(organization_id, id) on delete cascade,
  constraint doctor_schedule_exceptions_time_check check (
    (type = 'custom_hours' and start_time is not null and end_time > start_time)
    or (type <> 'custom_hours')
  ),
  unique (doctor_id, exception_date, type, start_time)
);

create index rooms_branch_id_idx on public.rooms (branch_id);
create index employees_organization_active_idx on public.employees (organization_id, is_active);
create index employees_profile_id_idx on public.employees (profile_id) where profile_id is not null;
create unique index employees_organization_profile_idx
  on public.employees (organization_id, profile_id) where profile_id is not null;
create index doctors_organization_active_idx on public.doctors (organization_id, is_active);
create index doctor_working_hours_lookup_idx
  on public.doctor_working_hours (doctor_id, branch_id, weekday, valid_from, valid_to);
create index doctor_schedule_exceptions_lookup_idx
  on public.doctor_schedule_exceptions (doctor_id, exception_date);

create trigger rooms_set_updated_at before update on public.rooms
for each row execute function public.set_updated_at();
create trigger employees_set_updated_at before update on public.employees
for each row execute function public.set_updated_at();
create trigger doctors_set_updated_at before update on public.doctors
for each row execute function public.set_updated_at();

create or replace function public.enforce_employee_profile_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.profile_id is not null and not exists (
    select 1
    from public.organization_members member
    where member.organization_id = new.organization_id
      and member.user_id = new.profile_id
      and member.status = 'active'
  ) then
    raise exception 'Employee profile must be an active organization member';
  end if;
  return new;
end;
$$;

create trigger employees_profile_scope_guard
before insert or update of organization_id, profile_id on public.employees
for each row execute function public.enforce_employee_profile_scope();

alter table public.rooms enable row level security;
alter table public.employees enable row level security;
alter table public.specializations enable row level security;
alter table public.doctors enable row level security;
alter table public.doctor_working_hours enable row level security;
alter table public.doctor_schedule_exceptions enable row level security;

create policy rooms_select on public.rooms for select to authenticated
using (public.current_user_has_permission(organization_id, 'appointments.read'));
create policy employees_select on public.employees for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'appointments.read')
  or public.current_user_has_permission(organization_id, 'users.manage')
);
create policy specializations_select on public.specializations for select to authenticated
using (public.current_user_has_permission(organization_id, 'appointments.read'));
create policy doctors_select on public.doctors for select to authenticated
using (public.current_user_has_permission(organization_id, 'appointments.read'));
create policy doctor_working_hours_select on public.doctor_working_hours for select to authenticated
using (public.current_user_has_permission(organization_id, 'appointments.read'));
create policy doctor_schedule_exceptions_select on public.doctor_schedule_exceptions for select to authenticated
using (public.current_user_has_permission(organization_id, 'appointments.read'));

grant select on public.rooms, public.employees, public.specializations, public.doctors,
  public.doctor_working_hours, public.doctor_schedule_exceptions to authenticated;

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
  if not public.current_user_has_permission(org_id, 'settings.manage') then
    raise exception 'Settings permission required' using errcode = '42501';
  end if;
  if char_length(trim(doctor_full_name)) not between 2 and 160 then
    raise exception 'Invalid doctor name';
  end if;
  if char_length(trim(doctor_specialization)) not between 2 and 100 then
    raise exception 'Invalid specialization';
  end if;
  if char_length(trim(doctor_room_name)) not between 1 and 100 then
    raise exception 'Invalid room name';
  end if;
  if duration_minutes not between 5 and 480 or workday_end <= workday_start then
    raise exception 'Invalid schedule';
  end if;
  if doctor_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid doctor color';
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

  insert into public.doctors (
    organization_id, employee_id, specialization_id, room_id,
    appointment_duration_minutes
  ) values (
    org_id, new_employee_id, selected_specialization_id, selected_room_id,
    duration_minutes
  ) returning id into new_doctor_id;

  insert into public.doctor_working_hours (
    organization_id, doctor_id, branch_id, weekday, start_time, end_time
  )
  select org_id, new_doctor_id, doctor_branch_id, weekday, workday_start, workday_end
  from generate_series(1, 5) as weekday;

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

create or replace function public.list_member_options(org_id uuid)
returns table (user_id uuid, full_name text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select member.user_id, nullif(trim(profile.full_name), '')
  from public.organization_members member
  join public.profiles profile on profile.id = member.user_id
  where member.organization_id = org_id
    and member.status = 'active'
    and public.current_user_has_permission(org_id, 'users.manage')
  order by profile.full_name, member.joined_at;
$$;

create or replace function public.list_doctor_options(org_id uuid)
returns table (
  id uuid,
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
security invoker
set search_path = public, pg_temp
as $$
  select
    doctor.id,
    employee.full_name,
    coalesce(employee.color, '#087f6d'),
    specialization.name,
    employee.branch_id,
    branch.name,
    doctor.room_id,
    room.name,
    doctor.appointment_duration_minutes
  from public.doctors doctor
  join public.employees employee
    on employee.id = doctor.employee_id
    and employee.organization_id = doctor.organization_id
  join public.specializations specialization
    on specialization.id = doctor.specialization_id
    and specialization.organization_id = doctor.organization_id
  join public.branches branch
    on branch.id = employee.branch_id
    and branch.organization_id = doctor.organization_id
  left join public.rooms room
    on room.id = doctor.room_id
    and room.organization_id = doctor.organization_id
  where doctor.organization_id = org_id
    and doctor.is_active
    and employee.is_active
    and public.current_user_has_permission(org_id, 'appointments.read')
  order by employee.full_name;
$$;

revoke all on function public.create_doctor_with_schedule(
  uuid, uuid, text, uuid, text, text, text, integer, time, time
) from public;
revoke all on function public.list_doctor_options(uuid) from public;
revoke all on function public.list_member_options(uuid) from public;
grant execute on function public.create_doctor_with_schedule(
  uuid, uuid, text, uuid, text, text, text, integer, time, time
) to authenticated;
grant execute on function public.list_doctor_options(uuid) to authenticated;
grant execute on function public.list_member_options(uuid) to authenticated;
