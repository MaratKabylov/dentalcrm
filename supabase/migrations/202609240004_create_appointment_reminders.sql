-- Добавляет простые автоматические напоминания: правила по событиям записи и recall,
-- дедуплицируемую очередь заданий, рендеринг шаблонов и постановку сообщений в очередь коммуникаций.

insert into public.permissions (code, description) values
  ('automation.read', 'Просмотр правил автоматических напоминаний'),
  ('automation.manage', 'Управление и запуск автоматических напоминаний')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = any(array['automation.read', 'automation.manage'])
where role.organization_id is null
  and role.code = any(array['owner', 'administrator', 'receptionist', 'manager'])
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'automation.read'
where role.organization_id is null
  and role.code = any(array['doctor', 'assistant', 'marketer', 'auditor'])
on conflict do nothing;

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  event_code text not null check (event_code in (
    'appointment_booked', 'appointment_before_24h', 'appointment_before_2h',
    'appointment_no_show', 'appointment_completed', 'recall_due'
  )),
  channel text not null check (channel in ('sms', 'whatsapp', 'telegram', 'email', 'push')),
  template_id uuid not null,
  conditions jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions) = 'object'),
  action_type text not null default 'send_message' check (action_type = 'send_message'),
  action_config jsonb not null default '{}'::jsonb check (jsonb_typeof(action_config) = 'object'),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_rules_template_fkey foreign key (organization_id, template_id)
    references public.communication_templates(organization_id, id) on delete restrict,
  unique (organization_id, id)
);

create unique index if not exists automation_rules_name_idx
  on public.automation_rules (organization_id, lower(name));
create index if not exists automation_rules_active_idx
  on public.automation_rules (organization_id, is_active, event_code);

create table if not exists public.reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  rule_id uuid not null,
  appointment_id uuid,
  recall_id uuid,
  patient_id uuid not null,
  source_event_at timestamptz not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'queued', 'skipped', 'failed')),
  communication_message_id uuid,
  attempts integer not null default 0 check (attempts >= 0),
  error_message text check (error_message is null or char_length(error_message) <= 2000),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_jobs_rule_fkey foreign key (organization_id, rule_id)
    references public.automation_rules(organization_id, id) on delete restrict,
  constraint reminder_jobs_appointment_fkey foreign key (organization_id, appointment_id)
    references public.appointments(organization_id, id) on delete restrict,
  constraint reminder_jobs_recall_fkey foreign key (organization_id, recall_id)
    references public.recalls(organization_id, id) on delete restrict,
  constraint reminder_jobs_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint reminder_jobs_message_fkey foreign key (organization_id, communication_message_id)
    references public.communication_messages(organization_id, id) on delete restrict,
  constraint reminder_jobs_source_check check (
    (appointment_id is not null and recall_id is null)
    or (appointment_id is null and recall_id is not null)
  ),
  constraint reminder_jobs_processed_check check (
    (status = 'pending' and processed_at is null and communication_message_id is null)
    or (status = 'queued' and processed_at is not null and communication_message_id is not null)
    or (status in ('skipped', 'failed') and processed_at is not null and communication_message_id is null)
  ),
  unique (organization_id, id)
);

create unique index if not exists reminder_jobs_appointment_once_idx
  on public.reminder_jobs (organization_id, rule_id, appointment_id)
  where appointment_id is not null;
create unique index if not exists reminder_jobs_recall_once_idx
  on public.reminder_jobs (organization_id, rule_id, recall_id)
  where recall_id is not null;
create index if not exists reminder_jobs_due_idx
  on public.reminder_jobs (organization_id, status, scheduled_for)
  where status = 'pending';
create index if not exists reminder_jobs_recent_idx
  on public.reminder_jobs (organization_id, created_at desc);

create or replace function public.normalize_automation_rule_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.name = trim(new.name);
  return new;
end;
$$;

drop trigger if exists automation_rules_normalize_fields on public.automation_rules;
create trigger automation_rules_normalize_fields
before insert or update of name on public.automation_rules
for each row execute function public.normalize_automation_rule_fields();

drop trigger if exists automation_rules_set_updated_at on public.automation_rules;
create trigger automation_rules_set_updated_at
before update on public.automation_rules
for each row execute function public.set_updated_at();

drop trigger if exists reminder_jobs_set_updated_at on public.reminder_jobs;
create trigger reminder_jobs_set_updated_at
before update on public.reminder_jobs
for each row execute function public.set_updated_at();

alter table public.automation_rules enable row level security;
alter table public.reminder_jobs enable row level security;

drop policy if exists automation_rules_select on public.automation_rules;
create policy automation_rules_select on public.automation_rules
for select to authenticated
using (public.current_user_has_permission(organization_id, 'automation.read'));

drop policy if exists reminder_jobs_select on public.reminder_jobs;
create policy reminder_jobs_select on public.reminder_jobs
for select to authenticated
using (public.current_user_has_permission(organization_id, 'automation.read'));

grant select on public.automation_rules, public.reminder_jobs to authenticated;

create or replace function public.save_automation_rule(
  org_id uuid,
  target_rule_id uuid,
  rule_name text,
  rule_event_code text,
  rule_channel text,
  rule_template_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_rule_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'automation.manage') then
    raise exception 'Automation manage permission required' using errcode = '42501';
  end if;
  if rule_name is null or char_length(trim(rule_name)) not between 2 and 160 then
    raise exception 'Rule name is invalid';
  end if;
  if rule_event_code not in (
    'appointment_booked', 'appointment_before_24h', 'appointment_before_2h',
    'appointment_no_show', 'appointment_completed', 'recall_due'
  ) then raise exception 'Rule event is invalid'; end if;
  if rule_channel not in ('sms', 'whatsapp', 'telegram', 'email', 'push') then
    raise exception 'Rule channel is invalid';
  end if;
  if not exists (
    select 1 from public.communication_templates template
    where template.organization_id = org_id
      and template.id = rule_template_id
      and template.is_active
      and (template.channel is null or template.channel = rule_channel)
  ) then raise exception 'Active compatible communication template not found'; end if;

  if target_rule_id is null then
    insert into public.automation_rules (
      organization_id, name, event_code, channel, template_id, created_by
    ) values (
      org_id, rule_name, rule_event_code, rule_channel, rule_template_id, auth.uid()
    ) returning id into saved_rule_id;
  else
    update public.automation_rules
    set name = rule_name,
        event_code = rule_event_code,
        channel = rule_channel,
        template_id = rule_template_id
    where organization_id = org_id and id = target_rule_id
    returning id into saved_rule_id;
    if saved_rule_id is null then raise exception 'Automation rule not found'; end if;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(),
    case when target_rule_id is null then 'automation_rule.created' else 'automation_rule.updated' end,
    'automation_rule', saved_rule_id,
    jsonb_build_object('name', trim(rule_name), 'event_code', rule_event_code, 'channel', rule_channel)
  );
  return saved_rule_id;
end;
$$;

create or replace function public.set_automation_rule_active(
  org_id uuid,
  target_rule_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'automation.manage') then
    raise exception 'Automation manage permission required' using errcode = '42501';
  end if;
  update public.automation_rules
  set is_active = target_is_active
  where organization_id = org_id and id = target_rule_id;
  if not found then raise exception 'Automation rule not found'; end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'automation_rule.activity_changed', 'automation_rule', target_rule_id,
    jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

create or replace function public.run_reminder_automation(org_id uuid)
returns table (generated_count integer, queued_count integer, skipped_count integer, failed_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  generated_total integer := 0;
  queued_total integer := 0;
  skipped_total integer := 0;
  failed_total integer := 0;
  affected_count integer;
  job record;
  recipient_value text;
  subject_value text;
  body_value text;
  patient_name text;
  clinic_name text;
  doctor_name text;
  appointment_date text;
  appointment_time text;
  recall_date text;
  message_id uuid;
begin
  if auth.role() is distinct from 'service_role'
     and not public.current_user_has_permission(org_id, 'automation.manage') then
    raise exception 'Automation manage permission required' using errcode = '42501';
  end if;

  insert into public.reminder_jobs (
    organization_id, rule_id, appointment_id, patient_id, source_event_at, scheduled_for
  )
  select org_id, source.rule_id, source.appointment_id, source.patient_id,
         source.source_event_at, source.scheduled_for
  from (
    select rule.id as rule_id, appointment.id as appointment_id, appointment.patient_id,
           appointment.created_at as source_event_at, appointment.created_at as scheduled_for
    from public.automation_rules rule
    join public.appointments appointment on appointment.organization_id = rule.organization_id
    join public.appointment_statuses status
      on status.organization_id = appointment.organization_id and status.id = appointment.status_id
    where rule.organization_id = org_id and rule.is_active and rule.event_code = 'appointment_booked'
      and appointment.created_at >= rule.created_at
      and appointment.start_at > now()
      and status.code in ('planned', 'unconfirmed', 'confirmed')
    union all
    select rule.id, appointment.id, appointment.patient_id, appointment.start_at,
           greatest(appointment.start_at - interval '24 hours', rule.created_at)
    from public.automation_rules rule
    join public.appointments appointment on appointment.organization_id = rule.organization_id
    join public.appointment_statuses status on status.id = appointment.status_id
    where rule.organization_id = org_id and rule.is_active and rule.event_code = 'appointment_before_24h'
      and status.code in ('planned', 'unconfirmed', 'confirmed') and appointment.start_at > now()
    union all
    select rule.id, appointment.id, appointment.patient_id, appointment.start_at,
           greatest(appointment.start_at - interval '2 hours', rule.created_at)
    from public.automation_rules rule
    join public.appointments appointment on appointment.organization_id = rule.organization_id
    join public.appointment_statuses status on status.id = appointment.status_id
    where rule.organization_id = org_id and rule.is_active and rule.event_code = 'appointment_before_2h'
      and status.code in ('planned', 'unconfirmed', 'confirmed') and appointment.start_at > now()
    union all
    select rule.id, appointment.id, appointment.patient_id, appointment.updated_at, appointment.updated_at
    from public.automation_rules rule
    join public.appointments appointment on appointment.organization_id = rule.organization_id
    join public.appointment_statuses status on status.id = appointment.status_id
    where rule.organization_id = org_id and rule.is_active and rule.event_code = 'appointment_no_show'
      and status.code = 'no_show' and appointment.updated_at >= rule.created_at
    union all
    select rule.id, appointment.id, appointment.patient_id,
           appointment.completed_at, appointment.completed_at
    from public.automation_rules rule
    join public.appointments appointment on appointment.organization_id = rule.organization_id
    join public.appointment_statuses status on status.id = appointment.status_id
    where rule.organization_id = org_id and rule.is_active and rule.event_code = 'appointment_completed'
      and status.code = 'completed' and appointment.completed_at >= rule.created_at
    ) source
  on conflict do nothing;
  get diagnostics affected_count = row_count;
  generated_total := generated_total + affected_count;

  insert into public.reminder_jobs (
    organization_id, rule_id, recall_id, patient_id, source_event_at, scheduled_for
  )
  select org_id, rule.id, recall.id, recall.patient_id,
         ((recall.due_date::timestamp + time '09:00') at time zone organization.timezone),
         greatest(
           ((recall.due_date::timestamp + time '09:00') at time zone organization.timezone),
           rule.created_at
         )
  from public.automation_rules rule
  join public.organizations organization on organization.id = rule.organization_id
  join public.recalls recall on recall.organization_id = rule.organization_id
  where rule.organization_id = org_id and rule.is_active and rule.event_code = 'recall_due'
    and recall.status in ('scheduled', 'due', 'contacted')
    and recall.due_date >= (rule.created_at at time zone organization.timezone)::date
  on conflict do nothing;
  get diagnostics affected_count = row_count;
  generated_total := generated_total + affected_count;

  for job in
    select reminder.id, reminder.patient_id, reminder.appointment_id, reminder.recall_id,
           rule.event_code, rule.channel, template.subject, template.body,
           patient.first_name, patient.last_name, patient.middle_name, patient.phone, patient.email,
           organization.name as organization_name, organization.timezone,
           appointment.start_at, appointment_status.code as appointment_status,
           employee.full_name as doctor_full_name, recall.due_date, recall.status as recall_status
    from public.reminder_jobs reminder
    join public.automation_rules rule
      on rule.organization_id = reminder.organization_id and rule.id = reminder.rule_id
    join public.communication_templates template
      on template.organization_id = rule.organization_id and template.id = rule.template_id
    join public.patients patient
      on patient.organization_id = reminder.organization_id and patient.id = reminder.patient_id
    join public.organizations organization on organization.id = reminder.organization_id
    left join public.appointments appointment
      on appointment.organization_id = reminder.organization_id and appointment.id = reminder.appointment_id
    left join public.appointment_statuses appointment_status
      on appointment_status.organization_id = appointment.organization_id
      and appointment_status.id = appointment.status_id
    left join public.doctors doctor
      on doctor.organization_id = appointment.organization_id and doctor.id = appointment.doctor_id
    left join public.employees employee
      on employee.organization_id = doctor.organization_id and employee.id = doctor.employee_id
    left join public.recalls recall
      on recall.organization_id = reminder.organization_id and recall.id = reminder.recall_id
    where reminder.organization_id = org_id
      and reminder.status = 'pending'
      and reminder.scheduled_for <= now()
      and rule.is_active
    order by reminder.scheduled_for, reminder.id
    for update of reminder skip locked
  loop
    begin
      if (job.event_code in ('appointment_booked', 'appointment_before_24h', 'appointment_before_2h')
            and job.appointment_status not in ('planned', 'unconfirmed', 'confirmed'))
         or (job.event_code = 'appointment_no_show' and job.appointment_status <> 'no_show')
         or (job.event_code = 'appointment_completed' and job.appointment_status <> 'completed')
         or (job.event_code = 'recall_due' and job.recall_status not in ('scheduled', 'due', 'contacted')) then
        update public.reminder_jobs
        set status = 'skipped', attempts = attempts + 1,
            error_message = 'Исходная запись или повторный визит больше не актуальны',
            processed_at = now()
        where id = job.id;
        skipped_total := skipped_total + 1;
        continue;
      end if;

      recipient_value := case when job.channel = 'email' then job.email
        when job.channel = 'push' then null else job.phone end;
      if recipient_value is null or trim(recipient_value) = '' then
        update public.reminder_jobs
        set status = 'skipped', attempts = attempts + 1,
            error_message = case when job.channel = 'email' then 'У пациента не указан email'
              when job.channel = 'push' then 'Для пациента не настроен push-получатель'
              else 'У пациента не указан телефон' end,
            processed_at = now()
        where id = job.id;
        skipped_total := skipped_total + 1;
        continue;
      end if;

      patient_name := concat_ws(' ', job.last_name, job.first_name, job.middle_name);
      clinic_name := job.organization_name;
      doctor_name := coalesce(job.doctor_full_name, '');
      appointment_date := coalesce(to_char(job.start_at at time zone job.timezone, 'DD.MM.YYYY'), '');
      appointment_time := coalesce(to_char(job.start_at at time zone job.timezone, 'HH24:MI'), '');
      recall_date := coalesce(to_char(job.due_date, 'DD.MM.YYYY'), '');

      subject_value := job.subject;
      body_value := job.body;
      subject_value := replace(subject_value, '{{recipient_name}}', patient_name);
      subject_value := replace(subject_value, '{{clinic_name}}', clinic_name);
      subject_value := replace(subject_value, '{{appointment_date}}', appointment_date);
      subject_value := replace(subject_value, '{{appointment_time}}', appointment_time);
      subject_value := replace(subject_value, '{{doctor_name}}', doctor_name);
      subject_value := replace(subject_value, '{{recall_date}}', recall_date);
      body_value := replace(body_value, '{{recipient_name}}', patient_name);
      body_value := replace(body_value, '{{clinic_name}}', clinic_name);
      body_value := replace(body_value, '{{appointment_date}}', appointment_date);
      body_value := replace(body_value, '{{appointment_time}}', appointment_time);
      body_value := replace(body_value, '{{doctor_name}}', doctor_name);
      body_value := replace(body_value, '{{recall_date}}', recall_date);

      if body_value ~ '\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\}'
         or coalesce(subject_value, '') ~ '\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\}' then
        update public.reminder_jobs
        set status = 'failed', attempts = attempts + 1,
            error_message = 'В шаблоне остались неизвестные переменные', processed_at = now()
        where id = job.id;
        failed_total := failed_total + 1;
        continue;
      end if;

      insert into public.communication_messages (
        organization_id, patient_id, template_id, channel, direction, provider,
        status, recipient, subject, body, created_by, queued_at
      )
      select org_id, job.patient_id, rule.template_id, job.channel, 'outbound', 'unassigned',
             'queued', trim(recipient_value), subject_value, body_value, auth.uid(), now()
      from public.automation_rules rule
      where rule.organization_id = org_id and rule.id = (
        select reminder.rule_id from public.reminder_jobs reminder where reminder.id = job.id
      )
      returning id into message_id;

      update public.reminder_jobs
      set status = 'queued', attempts = attempts + 1,
          communication_message_id = message_id, error_message = null, processed_at = now()
      where id = job.id;
      queued_total := queued_total + 1;
    exception when others then
      update public.reminder_jobs
      set status = 'failed', attempts = attempts + 1,
          error_message = left(sqlerrm, 2000), processed_at = now()
      where id = job.id;
      failed_total := failed_total + 1;
    end;
  end loop;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'reminder_automation.ran', 'organization', org_id,
    jsonb_build_object(
      'generated_count', generated_total, 'queued_count', queued_total,
      'skipped_count', skipped_total, 'failed_count', failed_total
    )
  );

  return query select generated_total, queued_total, skipped_total, failed_total;
end;
$$;

create or replace function public.list_automation_rules(org_id uuid)
returns table (
  id uuid, name text, event_code text, channel text, template_id uuid,
  template_name text, is_active boolean, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'automation.read') then
    raise exception 'Automation read permission required' using errcode = '42501';
  end if;
  return query
  select rule.id, rule.name, rule.event_code, rule.channel, rule.template_id,
         template.name, rule.is_active, rule.updated_at
  from public.automation_rules rule
  join public.communication_templates template
    on template.organization_id = rule.organization_id and template.id = rule.template_id
  where rule.organization_id = org_id
  order by rule.is_active desc, rule.name;
end;
$$;

create or replace function public.list_reminder_jobs(org_id uuid, result_limit integer default 100)
returns table (
  id uuid, rule_name text, event_code text, channel text, status text,
  patient_id uuid, patient_name text, appointment_id uuid, recall_id uuid,
  scheduled_for timestamptz, error_message text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'automation.read') then
    raise exception 'Automation read permission required' using errcode = '42501';
  end if;
  return query
  select job.id, rule.name, rule.event_code, rule.channel, job.status,
         job.patient_id, concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name),
         job.appointment_id, job.recall_id, job.scheduled_for, job.error_message, job.created_at
  from public.reminder_jobs job
  join public.automation_rules rule
    on rule.organization_id = job.organization_id and rule.id = job.rule_id
  join public.patients patient
    on patient.organization_id = job.organization_id and patient.id = job.patient_id
  where job.organization_id = org_id
  order by job.created_at desc
  limit least(greatest(coalesce(result_limit, 100), 1), 500);
end;
$$;

create or replace function public.get_reminder_summary(org_id uuid)
returns table (active_rules integer, pending_jobs integer, due_jobs integer, failed_jobs integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'automation.read') then
    raise exception 'Automation read permission required' using errcode = '42501';
  end if;
  return query
  select
    (select count(*)::integer from public.automation_rules rule
      where rule.organization_id = org_id and rule.is_active),
    count(*) filter (where job.status = 'pending')::integer,
    count(*) filter (where job.status = 'pending' and job.scheduled_for <= now())::integer,
    count(*) filter (where job.status = 'failed')::integer
  from public.reminder_jobs job
  where job.organization_id = org_id;
end;
$$;

revoke all on function public.save_automation_rule(uuid, uuid, text, text, text, uuid) from public;
revoke all on function public.set_automation_rule_active(uuid, uuid, boolean) from public;
revoke all on function public.run_reminder_automation(uuid) from public;
revoke all on function public.list_automation_rules(uuid) from public;
revoke all on function public.list_reminder_jobs(uuid, integer) from public;
revoke all on function public.get_reminder_summary(uuid) from public;

grant execute on function public.save_automation_rule(uuid, uuid, text, text, text, uuid) to authenticated;
grant execute on function public.set_automation_rule_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.run_reminder_automation(uuid) to authenticated, service_role;
grant execute on function public.list_automation_rules(uuid) to authenticated;
grant execute on function public.list_reminder_jobs(uuid, integer) to authenticated;
grant execute on function public.get_reminder_summary(uuid) to authenticated;
