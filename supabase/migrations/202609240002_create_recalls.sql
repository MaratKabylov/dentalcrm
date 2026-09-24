-- Добавляет систему повторных и контрольных визитов: права доступа,
-- tenant-safe recalls, статусы, аудит и генерацию связанных задач без дублей.

insert into public.permissions (code, description) values
  ('recalls.read', 'Просмотр повторных визитов'),
  ('recalls.manage', 'Управление повторными визитами')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = any(array['recalls.read', 'recalls.manage'])
where role.organization_id is null
  and role.code = any(array['owner', 'administrator', 'receptionist', 'doctor', 'assistant', 'manager'])
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'recalls.read'
where role.organization_id is null and role.code = 'auditor'
on conflict do nothing;

create table public.recalls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  doctor_id uuid,
  recall_type text not null check (recall_type in (
    'hygiene', 'control_visit', 'orthodontics', 'implant_check', 'unfinished_treatment', 'other'
  )),
  due_date date not null,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'due', 'contacted', 'booked', 'completed', 'cancelled'
  )),
  notes text check (notes is null or char_length(notes) <= 5000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  task_generated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recalls_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint recalls_doctor_fkey foreign key (organization_id, doctor_id)
    references public.doctors(organization_id, id) on delete restrict,
  constraint recalls_completed_at_consistency check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  unique (organization_id, id)
);

create index recalls_due_idx
  on public.recalls (organization_id, due_date, status)
  where status in ('scheduled', 'due', 'contacted');
create index recalls_patient_idx
  on public.recalls (organization_id, patient_id, due_date desc);
create index recalls_doctor_idx
  on public.recalls (organization_id, doctor_id, due_date)
  where doctor_id is not null;

alter table public.tasks add column source_recall_id uuid;
alter table public.tasks
  add constraint tasks_source_recall_fkey foreign key (organization_id, source_recall_id)
  references public.recalls(organization_id, id) on delete restrict;
create unique index tasks_source_recall_idx
  on public.tasks (organization_id, source_recall_id)
  where source_recall_id is not null;

create or replace function public.normalize_recall_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.notes = nullif(trim(new.notes), '');
  return new;
end;
$$;

create trigger recalls_normalize_fields
before insert or update of notes on public.recalls
for each row execute function public.normalize_recall_fields();

create trigger recalls_set_updated_at before update on public.recalls
for each row execute function public.set_updated_at();

alter table public.recalls enable row level security;

create policy recalls_select on public.recalls
for select to authenticated
using (public.current_user_has_permission(organization_id, 'recalls.read'));

grant select on public.recalls to authenticated;

create or replace function public.save_recall(
  org_id uuid,
  target_recall_id uuid,
  recall_patient_id uuid,
  recall_doctor_id uuid,
  target_recall_type text,
  target_due_date date,
  recall_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_recall_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'recalls.manage') then
    raise exception 'Recall manage permission required' using errcode = '42501';
  end if;
  if target_recall_type not in (
    'hygiene', 'control_visit', 'orthodontics', 'implant_check', 'unfinished_treatment', 'other'
  ) then raise exception 'Recall type is invalid'; end if;
  if target_due_date is null then raise exception 'Recall due date is required'; end if;
  if recall_notes is not null and char_length(trim(recall_notes)) > 5000 then
    raise exception 'Recall notes are invalid';
  end if;
  if not exists (
    select 1 from public.patients
    where organization_id = org_id and id = recall_patient_id and archived_at is null
  ) then raise exception 'Patient not found'; end if;
  if recall_doctor_id is not null and not exists (
    select 1 from public.doctors
    where organization_id = org_id and id = recall_doctor_id and is_active
  ) then raise exception 'Active doctor not found'; end if;

  if target_recall_id is null then
    insert into public.recalls (
      organization_id, patient_id, doctor_id, recall_type, due_date, notes, created_by
    ) values (
      org_id, recall_patient_id, recall_doctor_id, target_recall_type,
      target_due_date, recall_notes, auth.uid()
    ) returning id into saved_recall_id;
  else
    update public.recalls
    set patient_id = recall_patient_id,
        doctor_id = recall_doctor_id,
        recall_type = target_recall_type,
        due_date = target_due_date,
        notes = recall_notes
    where organization_id = org_id
      and id = target_recall_id
      and task_generated_at is null
    returning id into saved_recall_id;
    if saved_recall_id is null then raise exception 'Recall not found or task already generated'; end if;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(),
    case when target_recall_id is null then 'recall.created' else 'recall.updated' end,
    'recall', saved_recall_id,
    jsonb_build_object(
      'patient_id', recall_patient_id,
      'doctor_id', recall_doctor_id,
      'recall_type', target_recall_type,
      'due_date', target_due_date
    )
  );
  return saved_recall_id;
end;
$$;

create or replace function public.set_recall_status(
  org_id uuid,
  target_recall_id uuid,
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
  if not public.current_user_has_permission(org_id, 'recalls.manage') then
    raise exception 'Recall manage permission required' using errcode = '42501';
  end if;
  if target_status not in ('scheduled', 'due', 'contacted', 'booked', 'completed', 'cancelled') then
    raise exception 'Recall status is invalid';
  end if;

  select status into previous_status
  from public.recalls
  where organization_id = org_id and id = target_recall_id
  for update;
  if previous_status is null then raise exception 'Recall not found'; end if;
  if previous_status = target_status then return; end if;

  update public.recalls
  set status = target_status,
      completed_at = case when target_status = 'completed' then now() else null end
  where organization_id = org_id and id = target_recall_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    org_id, auth.uid(), 'recall.status_changed', 'recall', target_recall_id,
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', target_status)
  );
end;
$$;

create or replace function public.generate_due_recall_tasks(
  org_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recall_record record;
  generated_count integer := 0;
  generated_task_id uuid;
  assigned_member_id uuid;
  organization_timezone text;
  generation_date date;
begin
  if not public.current_user_has_permission(org_id, 'recalls.manage')
    or not public.current_user_has_permission(org_id, 'tasks.manage') then
    raise exception 'Recall and task manage permissions required' using errcode = '42501';
  end if;
  select timezone into organization_timezone
  from public.organizations where id = org_id and status = 'active';
  if organization_timezone is null then raise exception 'Active organization not found'; end if;
  generation_date := (now() at time zone organization_timezone)::date;

  for recall_record in
    select recall.*, patient.last_name, patient.first_name, doctor.employee_id
    from public.recalls recall
    join public.patients patient
      on patient.organization_id = recall.organization_id and patient.id = recall.patient_id
    left join public.doctors doctor
      on doctor.organization_id = recall.organization_id and doctor.id = recall.doctor_id
    where recall.organization_id = org_id
      and recall.due_date <= generation_date
      and recall.status in ('scheduled', 'due', 'contacted')
      and not exists (
        select 1 from public.tasks task
        where task.organization_id = recall.organization_id
          and task.source_recall_id = recall.id
      )
    order by recall.due_date, recall.created_at
    for update of recall skip locked
  loop
    assigned_member_id := null;
    if recall_record.employee_id is not null then
      select member.id into assigned_member_id
      from public.organization_members member
      where member.organization_id = org_id
        and member.employee_id = recall_record.employee_id
        and member.status = 'active'
      limit 1;
    end if;

    insert into public.tasks (
      organization_id, title, description, priority, assigned_to, created_by, due_at,
      related_entity_type, related_entity_id, source_recall_id
    ) values (
      org_id,
      left(
        case recall_record.recall_type
          when 'hygiene' then 'Пригласить на профессиональную гигиену'
          when 'control_visit' then 'Пригласить на контрольный визит'
          when 'orthodontics' then 'Связаться по ортодонтическому контролю'
          when 'implant_check' then 'Пригласить на контроль импланта'
          when 'unfinished_treatment' then 'Связаться по незавершённому лечению'
          else 'Связаться с пациентом по повторному визиту'
        end || ': ' || recall_record.last_name || ' ' || recall_record.first_name,
        240
      ),
      recall_record.notes,
      case when recall_record.due_date < generation_date then 'high' else 'normal' end,
      assigned_member_id,
      auth.uid(),
      (recall_record.due_date + time '09:00') at time zone organization_timezone,
      'patient',
      recall_record.patient_id,
      recall_record.id
    ) returning id into generated_task_id;

    update public.recalls
    set task_generated_at = now(),
        status = case when status = 'scheduled' then 'due' else status end
    where organization_id = org_id and id = recall_record.id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values
      (
        org_id, auth.uid(), 'task.created_from_recall', 'task', generated_task_id,
        jsonb_build_object('recall_id', recall_record.id, 'patient_id', recall_record.patient_id)
      ),
      (
        org_id, auth.uid(), 'recall.task_generated', 'recall', recall_record.id,
        jsonb_build_object('task_id', generated_task_id)
      );

    generated_count := generated_count + 1;
  end loop;

  return generated_count;
end;
$$;

create or replace function public.list_recalls(
  org_id uuid,
  search_query text default null,
  status_filter text default null,
  type_filter text default null,
  doctor_filter uuid default null,
  due_filter text default null,
  result_limit integer default 300
)
returns table (
  id uuid,
  patient_id uuid,
  patient_name text,
  patient_number text,
  patient_phone text,
  doctor_id uuid,
  doctor_name text,
  recall_type text,
  due_date date,
  status text,
  notes text,
  task_id uuid,
  is_overdue boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    recall.id,
    recall.patient_id,
    concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name),
    patient.external_number,
    patient.phone,
    recall.doctor_id,
    employee.full_name,
    recall.recall_type,
    recall.due_date,
    recall.status,
    recall.notes,
    task.id,
    recall.status in ('scheduled', 'due', 'contacted')
      and recall.due_date < (now() at time zone organization.timezone)::date,
    recall.created_at,
    recall.updated_at
  from public.recalls recall
  join public.organizations organization on organization.id = recall.organization_id
  join public.patients patient
    on patient.organization_id = recall.organization_id and patient.id = recall.patient_id
  left join public.doctors doctor
    on doctor.organization_id = recall.organization_id and doctor.id = recall.doctor_id
  left join public.employees employee
    on employee.organization_id = recall.organization_id and employee.id = doctor.employee_id
  left join public.tasks task
    on task.organization_id = recall.organization_id and task.source_recall_id = recall.id
  where recall.organization_id = org_id
    and public.current_user_has_permission(org_id, 'recalls.read')
    and (
      nullif(trim(status_filter), '') is null
      or status_filter = 'all'
      or status_filter = 'active' and recall.status in ('scheduled', 'due', 'contacted')
      or recall.status = status_filter
    )
    and (nullif(trim(type_filter), '') is null or type_filter = 'all' or recall.recall_type = type_filter)
    and (doctor_filter is null or recall.doctor_id = doctor_filter)
    and (
      nullif(trim(due_filter), '') is null
      or due_filter = 'all'
      or due_filter = 'overdue' and recall.status in ('scheduled', 'due', 'contacted')
        and recall.due_date < (now() at time zone organization.timezone)::date
      or due_filter = 'today'
        and recall.due_date = (now() at time zone organization.timezone)::date
      or due_filter = 'upcoming'
        and recall.due_date > (now() at time zone organization.timezone)::date
    )
    and (
      nullif(trim(search_query), '') is null
      or concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name) ilike '%' || trim(search_query) || '%'
      or patient.external_number ilike '%' || trim(search_query) || '%'
      or patient.phone ilike '%' || trim(search_query) || '%'
      or recall.notes ilike '%' || trim(search_query) || '%'
    )
  order by
    case when recall.status in ('scheduled', 'due', 'contacted') then 0 else 1 end,
    recall.due_date,
    recall.created_at desc
  limit least(greatest(result_limit, 1), 500);
$$;

create or replace function public.get_recall_summary(org_id uuid)
returns table (
  active_count bigint,
  overdue_count bigint,
  due_today_count bigint,
  task_pending_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where recall.status in ('scheduled', 'due', 'contacted')),
    count(*) filter (
      where recall.status in ('scheduled', 'due', 'contacted')
        and recall.due_date < (now() at time zone organization.timezone)::date
    ),
    count(*) filter (
      where recall.status in ('scheduled', 'due', 'contacted')
        and recall.due_date = (now() at time zone organization.timezone)::date
    ),
    count(*) filter (
      where recall.status in ('scheduled', 'due', 'contacted')
        and recall.due_date <= (now() at time zone organization.timezone)::date
        and recall.task_generated_at is null
    )
  from public.recalls recall
  join public.organizations organization on organization.id = recall.organization_id
  where recall.organization_id = org_id
    and public.current_user_has_permission(org_id, 'recalls.read');
$$;

create or replace function public.list_recall_patients(org_id uuid)
returns table (id uuid, label text, secondary text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select patient.id,
    concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name),
    '№ ' || patient.external_number || ' · ' || patient.phone
  from public.patients patient
  where patient.organization_id = org_id
    and patient.archived_at is null
    and public.current_user_has_permission(org_id, 'recalls.read')
    and public.current_user_has_permission(org_id, 'patients.read')
  order by 2;
$$;

create or replace function public.list_recall_doctors(org_id uuid)
returns table (id uuid, full_name text, specialization_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select doctor.id, employee.full_name, specialization.name
  from public.doctors doctor
  join public.employees employee
    on employee.organization_id = doctor.organization_id and employee.id = doctor.employee_id
  join public.specializations specialization
    on specialization.organization_id = doctor.organization_id
    and specialization.id = doctor.specialization_id
  where doctor.organization_id = org_id
    and doctor.is_active
    and employee.is_active
    and public.current_user_has_permission(org_id, 'recalls.read')
  order by employee.full_name;
$$;

revoke all on function public.save_recall(uuid, uuid, uuid, uuid, text, date, text) from public;
revoke all on function public.set_recall_status(uuid, uuid, text) from public;
revoke all on function public.generate_due_recall_tasks(uuid) from public;
revoke all on function public.list_recalls(uuid, text, text, text, uuid, text, integer) from public;
revoke all on function public.get_recall_summary(uuid) from public;
revoke all on function public.list_recall_patients(uuid) from public;
revoke all on function public.list_recall_doctors(uuid) from public;

grant execute on function public.save_recall(uuid, uuid, uuid, uuid, text, date, text) to authenticated;
grant execute on function public.set_recall_status(uuid, uuid, text) to authenticated;
grant execute on function public.generate_due_recall_tasks(uuid) to authenticated;
grant execute on function public.list_recalls(uuid, text, text, text, uuid, text, integer) to authenticated;
grant execute on function public.get_recall_summary(uuid) to authenticated;
grant execute on function public.list_recall_patients(uuid) to authenticated;
grant execute on function public.list_recall_doctors(uuid) to authenticated;
