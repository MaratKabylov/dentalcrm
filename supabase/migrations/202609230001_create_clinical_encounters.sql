create table public.clinical_encounters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  appointment_id uuid,
  doctor_id uuid not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  chief_complaint text,
  anamnesis text,
  diagnosis_summary text,
  clinical_notes text,
  status text not null default 'open',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_encounters_status_check check (status in ('open', 'closed')),
  constraint clinical_encounters_closed_at_check check (
    (status = 'open' and closed_at is null)
    or (status = 'closed' and closed_at is not null)
  ),
  constraint clinical_encounters_chief_complaint_length check (
    chief_complaint is null or char_length(chief_complaint) <= 4000
  ),
  constraint clinical_encounters_anamnesis_length check (
    anamnesis is null or char_length(anamnesis) <= 8000
  ),
  constraint clinical_encounters_diagnosis_summary_length check (
    diagnosis_summary is null or char_length(diagnosis_summary) <= 4000
  ),
  constraint clinical_encounters_clinical_notes_length check (
    clinical_notes is null or char_length(clinical_notes) <= 12000
  ),
  constraint clinical_encounters_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint clinical_encounters_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint clinical_encounters_appointment_fkey foreign key (organization_id, appointment_id)
    references public.appointments(organization_id, id) on delete restrict,
  constraint clinical_encounters_doctor_fkey foreign key (organization_id, doctor_id)
    references public.doctors(organization_id, id) on delete restrict,
  unique (organization_id, id)
);

create unique index clinical_encounters_appointment_idx
  on public.clinical_encounters (organization_id, appointment_id)
  where appointment_id is not null;
create index clinical_encounters_patient_idx
  on public.clinical_encounters (patient_id, opened_at desc);
create index clinical_encounters_doctor_open_idx
  on public.clinical_encounters (doctor_id, opened_at desc)
  where status = 'open';

create trigger clinical_encounters_set_updated_at
before update on public.clinical_encounters
for each row execute function public.set_updated_at();

alter table public.clinical_encounters enable row level security;

create policy clinical_encounters_select on public.clinical_encounters
for select to authenticated
using (public.current_user_has_permission(organization_id, 'clinical.read'));

grant select on public.clinical_encounters to authenticated;

create or replace function public.require_closed_encounter_for_completed_appointment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  previous_status_code text;
  next_status_code text;
begin
  if new.status_id = old.status_id then
    return new;
  end if;

  select status.code into previous_status_code
  from public.appointment_statuses status
  where status.id = old.status_id and status.organization_id = old.organization_id;

  select status.code into next_status_code
  from public.appointment_statuses status
  where status.id = new.status_id and status.organization_id = new.organization_id;

  if previous_status_code = 'in_progress' and next_status_code = 'completed'
    and not exists (
      select 1
      from public.clinical_encounters encounter
      where encounter.organization_id = new.organization_id
        and encounter.appointment_id = new.id
        and encounter.status = 'closed'
    )
  then
    raise exception 'Close the clinical encounter before completing the appointment';
  end if;

  return new;
end;
$$;

create trigger appointments_require_closed_encounter
before update of status_id on public.appointments
for each row execute function public.require_closed_encounter_for_completed_appointment();

create or replace function public.start_clinical_encounter(
  org_id uuid,
  target_appointment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_encounter_id uuid;
  new_encounter_id uuid;
  encounter_branch_id uuid;
  encounter_patient_id uuid;
  encounter_doctor_id uuid;
  current_status_id uuid;
  current_status_code text;
  in_progress_status_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'clinical.write') then
    raise exception 'Clinical write permission required' using errcode = '42501';
  end if;

  select encounter.id into existing_encounter_id
  from public.clinical_encounters encounter
  where encounter.organization_id = org_id
    and encounter.appointment_id = target_appointment_id;

  if existing_encounter_id is not null then
    return existing_encounter_id;
  end if;

  select
    appointment.branch_id,
    appointment.patient_id,
    appointment.doctor_id,
    appointment.status_id,
    status.code
  into
    encounter_branch_id,
    encounter_patient_id,
    encounter_doctor_id,
    current_status_id,
    current_status_code
  from public.appointments appointment
  join public.appointment_statuses status
    on status.id = appointment.status_id
    and status.organization_id = appointment.organization_id
  where appointment.id = target_appointment_id
    and appointment.organization_id = org_id
  for update of appointment;

  if current_status_id is null then
    raise exception 'Appointment not found';
  end if;

  select encounter.id into existing_encounter_id
  from public.clinical_encounters encounter
  where encounter.organization_id = org_id
    and encounter.appointment_id = target_appointment_id;

  if existing_encounter_id is not null then
    return existing_encounter_id;
  end if;

  if current_status_code not in ('arrived', 'in_progress') then
    raise exception 'Patient must arrive before the encounter can start';
  end if;

  if current_status_code = 'arrived' then
    select status.id into in_progress_status_id
    from public.appointment_statuses status
    where status.organization_id = org_id and status.code = 'in_progress';

    if in_progress_status_id is null then
      raise exception 'In-progress appointment status is not configured';
    end if;

    update public.appointments
    set status_id = in_progress_status_id,
        started_at = coalesce(started_at, now())
    where id = target_appointment_id and organization_id = org_id;

    insert into public.appointment_status_history (
      organization_id, appointment_id, from_status_id, to_status_id, changed_by
    ) values (
      org_id, target_appointment_id, current_status_id, in_progress_status_id, auth.uid()
    );

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id,
      before_data, after_data
    ) values (
      org_id, auth.uid(), 'appointment.status_changed', 'appointment', target_appointment_id,
      jsonb_build_object('status', 'arrived'),
      jsonb_build_object('status', 'in_progress', 'source', 'clinical_encounter')
    );
  end if;

  insert into public.clinical_encounters (
    organization_id, branch_id, patient_id, appointment_id, doctor_id, created_by
  ) values (
    org_id, encounter_branch_id, encounter_patient_id, target_appointment_id,
    encounter_doctor_id, auth.uid()
  ) returning id into new_encounter_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'clinical_encounter.started', 'clinical_encounter', new_encounter_id,
    jsonb_build_object(
      'appointment_id', target_appointment_id,
      'patient_id', encounter_patient_id,
      'doctor_id', encounter_doctor_id
    )
  );

  return new_encounter_id;
end;
$$;

create or replace function public.save_clinical_encounter(
  org_id uuid,
  target_encounter_id uuid,
  encounter_chief_complaint text default null,
  encounter_anamnesis text default null,
  encounter_diagnosis_summary text default null,
  encounter_clinical_notes text default null,
  close_encounter boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  encounter_status text;
  linked_appointment_id uuid;
  appointment_status_id uuid;
  appointment_status_code text;
  completed_status_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'clinical.write') then
    raise exception 'Clinical write permission required' using errcode = '42501';
  end if;

  select encounter.status, encounter.appointment_id
  into encounter_status, linked_appointment_id
  from public.clinical_encounters encounter
  where encounter.id = target_encounter_id
    and encounter.organization_id = org_id
  for update;

  if encounter_status is null then
    raise exception 'Clinical encounter not found';
  end if;
  if encounter_status <> 'open' then
    raise exception 'Closed clinical encounters cannot be changed';
  end if;

  update public.clinical_encounters
  set chief_complaint = nullif(trim(encounter_chief_complaint), ''),
      anamnesis = nullif(trim(encounter_anamnesis), ''),
      diagnosis_summary = nullif(trim(encounter_diagnosis_summary), ''),
      clinical_notes = nullif(trim(encounter_clinical_notes), ''),
      status = case when close_encounter then 'closed' else status end,
      closed_at = case when close_encounter then now() else closed_at end
  where id = target_encounter_id and organization_id = org_id;

  if close_encounter and linked_appointment_id is not null then
    select appointment.status_id, status.code
    into appointment_status_id, appointment_status_code
    from public.appointments appointment
    join public.appointment_statuses status
      on status.id = appointment.status_id
      and status.organization_id = appointment.organization_id
    where appointment.id = linked_appointment_id
      and appointment.organization_id = org_id
    for update of appointment;

    if appointment_status_code <> 'in_progress' then
      raise exception 'Only an in-progress appointment can be completed';
    end if;

    select status.id into completed_status_id
    from public.appointment_statuses status
    where status.organization_id = org_id and status.code = 'completed';
    if completed_status_id is null then
      raise exception 'Completed appointment status is not configured';
    end if;

    update public.appointments
    set status_id = completed_status_id,
        completed_at = coalesce(completed_at, now())
    where id = linked_appointment_id and organization_id = org_id;

    insert into public.appointment_status_history (
      organization_id, appointment_id, from_status_id, to_status_id, changed_by
    ) values (
      org_id, linked_appointment_id, appointment_status_id, completed_status_id, auth.uid()
    );

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id,
      before_data, after_data
    ) values (
      org_id, auth.uid(), 'appointment.status_changed', 'appointment', linked_appointment_id,
      jsonb_build_object('status', 'in_progress'),
      jsonb_build_object('status', 'completed', 'source', 'clinical_encounter')
    );
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id,
    auth.uid(),
    case when close_encounter then 'clinical_encounter.closed' else 'clinical_encounter.updated' end,
    'clinical_encounter',
    target_encounter_id,
    jsonb_build_object('status', case when close_encounter then 'closed' else 'open' end)
  );
end;
$$;

create or replace function public.get_clinical_encounter(
  org_id uuid,
  target_encounter_id uuid
)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  patient_id uuid,
  patient_name text,
  patient_external_number text,
  appointment_id uuid,
  appointment_start_at timestamptz,
  appointment_status_code text,
  doctor_id uuid,
  doctor_name text,
  specialization_name text,
  opened_at timestamptz,
  closed_at timestamptz,
  chief_complaint text,
  anamnesis text,
  diagnosis_summary text,
  clinical_notes text,
  status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    encounter.id,
    encounter.branch_id,
    branch.name,
    encounter.patient_id,
    trim(concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name)),
    patient.external_number,
    encounter.appointment_id,
    appointment.start_at,
    appointment_status.code,
    encounter.doctor_id,
    employee.full_name,
    specialization.name,
    encounter.opened_at,
    encounter.closed_at,
    encounter.chief_complaint,
    encounter.anamnesis,
    encounter.diagnosis_summary,
    encounter.clinical_notes,
    encounter.status
  from public.clinical_encounters encounter
  join public.branches branch
    on branch.id = encounter.branch_id and branch.organization_id = encounter.organization_id
  join public.patients patient
    on patient.id = encounter.patient_id and patient.organization_id = encounter.organization_id
  join public.doctors doctor
    on doctor.id = encounter.doctor_id and doctor.organization_id = encounter.organization_id
  join public.employees employee
    on employee.id = doctor.employee_id and employee.organization_id = encounter.organization_id
  join public.specializations specialization
    on specialization.id = doctor.specialization_id
    and specialization.organization_id = encounter.organization_id
  left join public.appointments appointment
    on appointment.id = encounter.appointment_id
    and appointment.organization_id = encounter.organization_id
  left join public.appointment_statuses appointment_status
    on appointment_status.id = appointment.status_id
    and appointment_status.organization_id = encounter.organization_id
  where encounter.organization_id = org_id
    and encounter.id = target_encounter_id
    and public.current_user_has_permission(org_id, 'clinical.read');
$$;

create or replace function public.list_clinical_encounters(
  org_id uuid,
  result_limit integer default 50
)
returns table (
  id uuid,
  patient_id uuid,
  patient_name text,
  patient_external_number text,
  doctor_name text,
  branch_name text,
  opened_at timestamptz,
  closed_at timestamptz,
  status text
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
    encounter.opened_at,
    encounter.closed_at,
    encounter.status
  from public.clinical_encounters encounter
  join public.patients patient
    on patient.id = encounter.patient_id and patient.organization_id = encounter.organization_id
  join public.doctors doctor
    on doctor.id = encounter.doctor_id and doctor.organization_id = encounter.organization_id
  join public.employees employee
    on employee.id = doctor.employee_id and employee.organization_id = encounter.organization_id
  join public.branches branch
    on branch.id = encounter.branch_id and branch.organization_id = encounter.organization_id
  where encounter.organization_id = org_id
    and public.current_user_has_permission(org_id, 'clinical.read')
  order by (encounter.status = 'open') desc, encounter.opened_at desc
  limit least(greatest(result_limit, 1), 100);
$$;

revoke all on function public.start_clinical_encounter(uuid, uuid) from public;
revoke all on function public.require_closed_encounter_for_completed_appointment() from public;
revoke all on function public.save_clinical_encounter(
  uuid, uuid, text, text, text, text, boolean
) from public;
revoke all on function public.get_clinical_encounter(uuid, uuid) from public;
revoke all on function public.list_clinical_encounters(uuid, integer) from public;

grant execute on function public.start_clinical_encounter(uuid, uuid) to authenticated;
grant execute on function public.save_clinical_encounter(
  uuid, uuid, text, text, text, text, boolean
) to authenticated;
grant execute on function public.get_clinical_encounter(uuid, uuid) to authenticated;
grant execute on function public.list_clinical_encounters(uuid, integer) to authenticated;
