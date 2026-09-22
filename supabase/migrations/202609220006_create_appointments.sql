create extension if not exists btree_gist with schema extensions;

create table public.appointment_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_terminal boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code)
);

create or replace function public.seed_appointment_statuses(target_organization_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.appointment_statuses (
    organization_id, code, name, color, is_terminal, sort_order
  ) values
    (target_organization_id, 'planned', 'Запланирован', '#64748b', false, 10),
    (target_organization_id, 'unconfirmed', 'Не подтверждён', '#f59e0b', false, 20),
    (target_organization_id, 'confirmed', 'Подтверждён', '#0284c7', false, 30),
    (target_organization_id, 'arrived', 'Прибыл', '#7c3aed', false, 40),
    (target_organization_id, 'in_progress', 'На приёме', '#0891b2', false, 50),
    (target_organization_id, 'completed', 'Завершён', '#059669', true, 60),
    (target_organization_id, 'cancelled', 'Отменён', '#dc2626', true, 70),
    (target_organization_id, 'no_show', 'Не пришёл', '#9f1239', true, 80),
    (target_organization_id, 'rescheduled', 'Перенесён', '#475569', true, 90)
  on conflict (organization_id, code) do nothing;
$$;

select public.seed_appointment_statuses(id) from public.organizations;

create or replace function public.seed_appointment_statuses_for_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.seed_appointment_statuses(new.id);
  return new;
end;
$$;

create trigger organizations_seed_appointment_statuses
after insert on public.organizations
for each row execute function public.seed_appointment_statuses_for_new_organization();

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  doctor_id uuid not null,
  room_id uuid,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status_id uuid not null,
  reason text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_check check (end_at > start_at),
  constraint appointments_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint appointments_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint appointments_doctor_fkey foreign key (organization_id, doctor_id)
    references public.doctors(organization_id, id) on delete restrict,
  constraint appointments_room_fkey foreign key (organization_id, room_id)
    references public.rooms(organization_id, id) on delete restrict,
  constraint appointments_status_fkey foreign key (organization_id, status_id)
    references public.appointment_statuses(organization_id, id) on delete restrict,
  unique (organization_id, id),
  constraint appointments_doctor_time_excl exclude using gist (
    doctor_id extensions.gist_uuid_ops with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (cancelled_at is null),
  constraint appointments_room_time_excl exclude using gist (
    room_id extensions.gist_uuid_ops with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (room_id is not null and cancelled_at is null)
);

create table public.appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  appointment_id uuid not null,
  from_status_id uuid,
  to_status_id uuid not null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  comment text,
  constraint appointment_status_history_appointment_fkey
    foreign key (organization_id, appointment_id)
    references public.appointments(organization_id, id) on delete cascade,
  constraint appointment_status_history_from_status_fkey
    foreign key (organization_id, from_status_id)
    references public.appointment_statuses(organization_id, id) on delete restrict,
  constraint appointment_status_history_to_status_fkey
    foreign key (organization_id, to_status_id)
    references public.appointment_statuses(organization_id, id) on delete restrict
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index appointments_organization_start_idx
  on public.appointments (organization_id, start_at);
create index appointments_patient_idx on public.appointments (patient_id, start_at desc);
create index appointments_doctor_idx on public.appointments (doctor_id, start_at);
create index appointment_status_history_appointment_idx
  on public.appointment_status_history (appointment_id, changed_at);
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

alter table public.appointment_statuses enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_status_history enable row level security;
alter table public.notifications enable row level security;

create policy appointment_statuses_select on public.appointment_statuses
for select to authenticated
using (public.current_user_has_permission(organization_id, 'appointments.read'));
create policy appointments_select on public.appointments
for select to authenticated
using (public.current_user_has_permission(organization_id, 'appointments.read'));
create policy appointment_status_history_select on public.appointment_status_history
for select to authenticated
using (public.current_user_has_permission(organization_id, 'appointments.read'));
create policy notifications_select on public.notifications
for select to authenticated
using (
  user_id = auth.uid()
  and public.current_user_has_org_access(organization_id)
);
create policy notifications_update on public.notifications
for update to authenticated
using (
  user_id = auth.uid()
  and public.current_user_has_org_access(organization_id)
)
with check (
  user_id = auth.uid()
  and public.current_user_has_org_access(organization_id)
);

grant select on public.appointment_statuses, public.appointments,
  public.appointment_status_history, public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

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
  organization_timezone text;
  calculated_start_at timestamptz;
  calculated_end_at timestamptz;
  weekday_number smallint;
begin
  if not public.current_user_has_permission(org_id, 'appointments.manage') then
    raise exception 'Appointment manage permission required' using errcode = '42501';
  end if;
  select organization.timezone into organization_timezone
  from public.organizations organization
  where organization.id = org_id and organization.status = 'active';
  if organization_timezone is null then
    raise exception 'Active organization not found';
  end if;
  if appointment_date < (now() at time zone organization_timezone)::date then
    raise exception 'Appointments cannot be created in the past';
  end if;
  if not exists (
    select 1 from public.branches branch
    where branch.id = appointment_branch_id
      and branch.organization_id = org_id
      and branch.is_active
  ) then
    raise exception 'Active branch not found';
  end if;
  if not exists (
    select 1 from public.patients patient
    where patient.id = appointment_patient_id
      and patient.organization_id = org_id
      and patient.archived_at is null
  ) then
    raise exception 'Active patient not found';
  end if;

  select
    coalesce(appointment_room_id, doctor.room_id),
    coalesce(duration_minutes, doctor.appointment_duration_minutes)
  into selected_room_id, selected_duration
  from public.doctors doctor
  join public.employees employee
    on employee.id = doctor.employee_id
    and employee.organization_id = doctor.organization_id
  where doctor.id = appointment_doctor_id
    and doctor.organization_id = org_id
    and doctor.is_active
    and employee.is_active;

  if selected_duration is null or selected_duration not between 5 and 480 then
    raise exception 'Active doctor not found or duration is invalid';
  end if;
  if selected_room_id is not null and not exists (
    select 1 from public.rooms room
    where room.id = selected_room_id
      and room.organization_id = org_id
      and room.branch_id = appointment_branch_id
      and room.is_active
  ) then
    raise exception 'Active room in the selected branch not found';
  end if;

  calculated_start_at := (appointment_date + appointment_start_time) at time zone organization_timezone;
  calculated_end_at := calculated_start_at + make_interval(mins => selected_duration);
  weekday_number := extract(isodow from appointment_date)::smallint;

  if not exists (
    select 1
    from public.doctor_working_hours hours
    where hours.organization_id = org_id
      and hours.doctor_id = appointment_doctor_id
      and hours.branch_id = appointment_branch_id
      and hours.weekday = weekday_number
      and appointment_date >= hours.valid_from
      and (hours.valid_to is null or appointment_date <= hours.valid_to)
      and appointment_start_time >= hours.start_time
      and appointment_start_time + make_interval(mins => selected_duration) <= hours.end_time
  ) then
    raise exception 'Appointment is outside doctor working hours';
  end if;

  if exists (
    select 1
    from public.doctor_schedule_exceptions exception
    where exception.organization_id = org_id
      and exception.doctor_id = appointment_doctor_id
      and exception.exception_date = appointment_date
      and exception.type in ('day_off', 'sick_leave', 'vacation', 'blocked')
  ) or (
    exists (
      select 1 from public.doctor_schedule_exceptions exception
      where exception.organization_id = org_id
        and exception.doctor_id = appointment_doctor_id
        and exception.exception_date = appointment_date
        and exception.type = 'custom_hours'
    )
    and not exists (
      select 1 from public.doctor_schedule_exceptions exception
      where exception.organization_id = org_id
        and exception.doctor_id = appointment_doctor_id
        and exception.exception_date = appointment_date
        and exception.type = 'custom_hours'
        and appointment_start_time >= exception.start_time
        and appointment_start_time + make_interval(mins => selected_duration) <= exception.end_time
    )
  ) then
    raise exception 'Doctor is unavailable at the selected time';
  end if;

  select status.id into selected_status_id
  from public.appointment_statuses status
  where status.organization_id = org_id and status.code = 'unconfirmed';
  if selected_status_id is null then
    raise exception 'Initial appointment status is not configured';
  end if;

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
  ) values (
    org_id, new_appointment_id, null, selected_status_id, auth.uid()
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'appointment.created', 'appointment', new_appointment_id,
    jsonb_build_object(
      'patient_id', appointment_patient_id,
      'doctor_id', appointment_doctor_id,
      'branch_id', appointment_branch_id,
      'start_at', calculated_start_at,
      'end_at', calculated_end_at
    )
  );

  return new_appointment_id;
exception
  when exclusion_violation then
    raise exception 'Doctor or room already has an appointment at this time'
      using errcode = '23P01';
end;
$$;

create or replace function public.change_appointment_status(
  org_id uuid,
  target_appointment_id uuid,
  target_status_code text,
  transition_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_status_id uuid;
  current_status_code text;
  next_status_id uuid;
  appointment_doctor_id uuid;
  appointment_patient_id uuid;
  doctor_user_id uuid;
  patient_name text;
begin
  if not public.current_user_has_permission(org_id, 'appointments.manage') then
    raise exception 'Appointment manage permission required' using errcode = '42501';
  end if;

  select appointment.status_id, status.code, appointment.doctor_id, appointment.patient_id
  into current_status_id, current_status_code, appointment_doctor_id, appointment_patient_id
  from public.appointments appointment
  join public.appointment_statuses status on status.id = appointment.status_id
  where appointment.id = target_appointment_id
    and appointment.organization_id = org_id
  for update of appointment;

  if current_status_id is null then
    raise exception 'Appointment not found';
  end if;

  select status.id into next_status_id
  from public.appointment_statuses status
  where status.organization_id = org_id and status.code = target_status_code;
  if next_status_id is null then
    raise exception 'Appointment status not found';
  end if;

  if not (
    (current_status_code in ('planned', 'unconfirmed') and target_status_code in ('confirmed', 'arrived', 'cancelled', 'no_show', 'rescheduled'))
    or (current_status_code = 'confirmed' and target_status_code in ('arrived', 'cancelled', 'no_show', 'rescheduled'))
    or (current_status_code = 'arrived' and target_status_code in ('in_progress', 'cancelled'))
    or (current_status_code = 'in_progress' and target_status_code = 'completed')
  ) then
    raise exception 'Invalid appointment status transition';
  end if;

  update public.appointments
  set
    status_id = next_status_id,
    confirmed_at = case when target_status_code = 'confirmed' then now() else confirmed_at end,
    arrived_at = case when target_status_code = 'arrived' then now() else arrived_at end,
    started_at = case when target_status_code = 'in_progress' then now() else started_at end,
    completed_at = case when target_status_code = 'completed' then now() else completed_at end,
    cancelled_at = case when target_status_code in ('cancelled', 'rescheduled') then now() else cancelled_at end
  where id = target_appointment_id and organization_id = org_id;

  insert into public.appointment_status_history (
    organization_id, appointment_id, from_status_id, to_status_id, changed_by, comment
  ) values (
    org_id, target_appointment_id, current_status_id, next_status_id,
    auth.uid(), nullif(trim(transition_comment), '')
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    org_id, auth.uid(), 'appointment.status_changed', 'appointment', target_appointment_id,
    jsonb_build_object('status', current_status_code),
    jsonb_build_object('status', target_status_code)
  );

  if target_status_code = 'arrived' then
    select employee.profile_id into doctor_user_id
    from public.doctors doctor
    join public.employees employee on employee.id = doctor.employee_id
    where doctor.id = appointment_doctor_id and doctor.organization_id = org_id;

    select trim(patient.last_name || ' ' || patient.first_name) into patient_name
    from public.patients patient
    where patient.id = appointment_patient_id and patient.organization_id = org_id;

    if doctor_user_id is not null then
      insert into public.notifications (
        organization_id, user_id, type, title, body, entity_type, entity_id
      ) values (
        org_id, doctor_user_id, 'patient_arrived', 'Пациент прибыл', patient_name,
        'appointment', target_appointment_id
      );
    end if;
  end if;
end;
$$;

create or replace function public.list_calendar_appointments(
  org_id uuid,
  date_from date,
  date_to date
)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  patient_id uuid,
  patient_name text,
  patient_phone text,
  doctor_id uuid,
  doctor_name text,
  doctor_color text,
  room_name text,
  start_at timestamptz,
  end_at timestamptz,
  status_code text,
  status_name text,
  status_color text,
  reason text,
  notes text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    appointment.id,
    appointment.branch_id,
    branch.name,
    appointment.patient_id,
    trim(patient.last_name || ' ' || patient.first_name || ' ' || coalesce(patient.middle_name, '')),
    patient.phone,
    appointment.doctor_id,
    employee.full_name,
    coalesce(employee.color, '#087f6d'),
    room.name,
    appointment.start_at,
    appointment.end_at,
    status.code,
    status.name,
    status.color,
    appointment.reason,
    appointment.notes
  from public.appointments appointment
  join public.organizations organization on organization.id = appointment.organization_id
  join public.branches branch on branch.id = appointment.branch_id
  join public.patients patient on patient.id = appointment.patient_id
  join public.doctors doctor on doctor.id = appointment.doctor_id
  join public.employees employee on employee.id = doctor.employee_id
  join public.appointment_statuses status on status.id = appointment.status_id
  left join public.rooms room on room.id = appointment.room_id
  where appointment.organization_id = org_id
    and public.current_user_has_permission(org_id, 'appointments.read')
    and appointment.start_at >= (date_from::timestamp at time zone organization.timezone)
    and appointment.start_at < ((date_to + 1)::timestamp at time zone organization.timezone)
  order by appointment.start_at, employee.full_name;
$$;

revoke all on function public.seed_appointment_statuses(uuid) from public;
revoke all on function public.create_appointment(
  uuid, uuid, uuid, uuid, date, time, uuid, integer, text, text
) from public;
revoke all on function public.change_appointment_status(uuid, uuid, text, text) from public;
revoke all on function public.list_calendar_appointments(uuid, date, date) from public;
grant execute on function public.create_appointment(
  uuid, uuid, uuid, uuid, date, time, uuid, integer, text, text
) to authenticated;
grant execute on function public.change_appointment_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.list_calendar_appointments(uuid, date, date) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
    ) then
      alter publication supabase_realtime add table public.appointments;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end;
$$;
