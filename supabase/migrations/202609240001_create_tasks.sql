-- Добавляет единый модуль задач: права доступа, tenant-safe хранение,
-- привязки к лидам и пациентам, сроки, статусы, аудит и RPC для интерфейса.

insert into public.permissions (code, description) values
  ('tasks.read', 'Просмотр задач'),
  ('tasks.manage', 'Управление задачами')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = any(array['tasks.read', 'tasks.manage'])
where role.organization_id is null
  and role.code = any(array['owner', 'administrator', 'receptionist', 'doctor', 'assistant', 'marketer', 'manager'])
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'tasks.read'
where role.organization_id is null and role.code = 'auditor'
on conflict do nothing;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid,
  title text not null check (char_length(trim(title)) between 2 and 240),
  description text check (description is null or char_length(description) <= 5000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  due_at timestamptz,
  related_entity_type text check (related_entity_type is null or related_entity_type in ('lead', 'patient')),
  related_entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tasks_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint tasks_assignee_fkey foreign key (organization_id, assigned_to)
    references public.organization_members(organization_id, id) on delete restrict,
  constraint tasks_related_entity_pair check (
    (related_entity_type is null and related_entity_id is null)
    or (related_entity_type is not null and related_entity_id is not null)
  ),
  constraint tasks_completed_at_consistency check (
    (status = 'done' and completed_at is not null)
    or (status <> 'done' and completed_at is null)
  ),
  unique (organization_id, id)
);

create index tasks_active_due_idx
  on public.tasks (organization_id, due_at, priority)
  where status in ('todo', 'in_progress');
create index tasks_assignee_idx
  on public.tasks (organization_id, assigned_to, status, due_at);
create index tasks_related_entity_idx
  on public.tasks (organization_id, related_entity_type, related_entity_id);

create or replace function public.normalize_task_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.title = trim(new.title);
  new.description = nullif(trim(new.description), '');
  return new;
end;
$$;

create trigger tasks_normalize_fields
before insert or update of title, description on public.tasks
for each row execute function public.normalize_task_fields();

create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

create policy tasks_select on public.tasks
for select to authenticated
using (public.current_user_has_permission(organization_id, 'tasks.read'));

grant select on public.tasks to authenticated;

create or replace function public.save_task(
  org_id uuid,
  target_task_id uuid,
  task_branch_id uuid,
  task_title text,
  task_description text,
  task_priority text,
  task_assigned_to uuid,
  task_due_date date,
  task_due_time time without time zone,
  task_related_entity_type text,
  task_related_entity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_task_id uuid;
  resolved_due_at timestamptz;
  organization_timezone text;
begin
  if not public.current_user_has_permission(org_id, 'tasks.manage') then
    raise exception 'Task manage permission required' using errcode = '42501';
  end if;
  if task_title is null or char_length(trim(task_title)) not between 2 and 240 then
    raise exception 'Task title is invalid';
  end if;
  if task_description is not null and char_length(trim(task_description)) > 5000 then
    raise exception 'Task description is invalid';
  end if;
  if task_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Task priority is invalid';
  end if;
  if (task_due_date is null) <> (task_due_time is null) then
    raise exception 'Task due date and time must be provided together';
  end if;
  if (task_related_entity_type is null) <> (task_related_entity_id is null) then
    raise exception 'Task relation is incomplete';
  end if;
  if task_related_entity_type is not null and task_related_entity_type not in ('lead', 'patient') then
    raise exception 'Task relation type is invalid';
  end if;
  if task_branch_id is not null and not exists (
    select 1 from public.branches
    where organization_id = org_id and id = task_branch_id and is_active
  ) then raise exception 'Active branch not found'; end if;
  if task_assigned_to is not null and not exists (
    select 1 from public.organization_members
    where organization_id = org_id and id = task_assigned_to and status = 'active'
  ) then raise exception 'Active assignee not found'; end if;
  if task_related_entity_type = 'lead' and not exists (
    select 1 from public.leads
    where organization_id = org_id and id = task_related_entity_id and archived_at is null
  ) then raise exception 'Lead not found'; end if;
  if task_related_entity_type = 'patient' and not exists (
    select 1 from public.patients
    where organization_id = org_id and id = task_related_entity_id and archived_at is null
  ) then raise exception 'Patient not found'; end if;

  if task_due_date is not null then
    select timezone into organization_timezone
    from public.organizations where id = org_id and status = 'active';
    if organization_timezone is null then raise exception 'Active organization not found'; end if;
    resolved_due_at := (task_due_date + task_due_time) at time zone organization_timezone;
  end if;

  if target_task_id is null then
    insert into public.tasks (
      organization_id, branch_id, title, description, priority, assigned_to,
      created_by, due_at, related_entity_type, related_entity_id
    ) values (
      org_id, task_branch_id, task_title, task_description, task_priority, task_assigned_to,
      auth.uid(), resolved_due_at, task_related_entity_type, task_related_entity_id
    ) returning id into saved_task_id;
  else
    update public.tasks
    set branch_id = task_branch_id,
        title = task_title,
        description = task_description,
        priority = task_priority,
        assigned_to = task_assigned_to,
        due_at = resolved_due_at,
        related_entity_type = task_related_entity_type,
        related_entity_id = task_related_entity_id
    where organization_id = org_id and id = target_task_id
    returning id into saved_task_id;
    if saved_task_id is null then raise exception 'Task not found'; end if;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(),
    case when target_task_id is null then 'task.created' else 'task.updated' end,
    'task', saved_task_id,
    jsonb_build_object(
      'priority', task_priority,
      'assigned_to', task_assigned_to,
      'due_at', resolved_due_at,
      'related_entity_type', task_related_entity_type,
      'related_entity_id', task_related_entity_id
    )
  );
  return saved_task_id;
end;
$$;

create or replace function public.set_task_status(
  org_id uuid,
  target_task_id uuid,
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
  if not public.current_user_has_permission(org_id, 'tasks.manage') then
    raise exception 'Task manage permission required' using errcode = '42501';
  end if;
  if target_status not in ('todo', 'in_progress', 'done', 'cancelled') then
    raise exception 'Task status is invalid';
  end if;

  select status into previous_status
  from public.tasks
  where organization_id = org_id and id = target_task_id
  for update;
  if previous_status is null then raise exception 'Task not found'; end if;
  if previous_status = target_status then return; end if;

  update public.tasks
  set status = target_status,
      completed_at = case when target_status = 'done' then now() else null end
  where organization_id = org_id and id = target_task_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    org_id, auth.uid(), 'task.status_changed', 'task', target_task_id,
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', target_status)
  );
end;
$$;

create or replace function public.list_tasks(
  org_id uuid,
  search_query text default null,
  status_filter text default null,
  priority_filter text default null,
  assignee_filter uuid default null,
  due_filter text default null,
  result_limit integer default 200
)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  title text,
  description text,
  status text,
  priority text,
  assigned_to uuid,
  assignee_name text,
  creator_name text,
  due_at timestamptz,
  is_overdue boolean,
  related_entity_type text,
  related_entity_id uuid,
  related_entity_name text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    task.id,
    task.branch_id,
    branch.name,
    task.title,
    task.description,
    task.status,
    task.priority,
    task.assigned_to,
    coalesce(nullif(trim(assignee_profile.full_name), ''), case when task.assigned_to is null then null else 'Сотрудник' end),
    coalesce(nullif(trim(creator_profile.full_name), ''), 'Сотрудник'),
    task.due_at,
    task.status in ('todo', 'in_progress') and task.due_at < now(),
    task.related_entity_type,
    task.related_entity_id,
    case
      when task.related_entity_type = 'lead' then related_lead.full_name
      when task.related_entity_type = 'patient' then concat_ws(' ', related_patient.last_name, related_patient.first_name, related_patient.middle_name)
      else null
    end,
    task.created_at,
    task.updated_at,
    task.completed_at
  from public.tasks task
  join public.organizations organization on organization.id = task.organization_id
  join public.profiles creator_profile on creator_profile.id = task.created_by
  left join public.branches branch
    on branch.organization_id = task.organization_id and branch.id = task.branch_id
  left join public.organization_members assignee
    on assignee.organization_id = task.organization_id and assignee.id = task.assigned_to
  left join public.profiles assignee_profile on assignee_profile.id = assignee.user_id
  left join public.leads related_lead
    on task.related_entity_type = 'lead'
    and related_lead.organization_id = task.organization_id
    and related_lead.id = task.related_entity_id
  left join public.patients related_patient
    on task.related_entity_type = 'patient'
    and related_patient.organization_id = task.organization_id
    and related_patient.id = task.related_entity_id
  where task.organization_id = org_id
    and public.current_user_has_permission(org_id, 'tasks.read')
    and (
      nullif(trim(status_filter), '') is null
      or status_filter = 'all'
      or status_filter = 'open' and task.status in ('todo', 'in_progress')
      or task.status = status_filter
    )
    and (nullif(trim(priority_filter), '') is null or priority_filter = 'all' or task.priority = priority_filter)
    and (assignee_filter is null or task.assigned_to = assignee_filter)
    and (
      nullif(trim(due_filter), '') is null
      or due_filter = 'all'
      or due_filter = 'overdue' and task.status in ('todo', 'in_progress') and task.due_at < now()
      or due_filter = 'today' and (task.due_at at time zone organization.timezone)::date = (now() at time zone organization.timezone)::date
      or due_filter = 'no_due' and task.due_at is null
    )
    and (
      nullif(trim(search_query), '') is null
      or task.title ilike '%' || trim(search_query) || '%'
      or task.description ilike '%' || trim(search_query) || '%'
    )
  order by
    case when task.status in ('todo', 'in_progress') then 0 else 1 end,
    task.due_at asc nulls last,
    case task.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
    task.created_at desc
  limit least(greatest(result_limit, 1), 500);
$$;

create or replace function public.get_task_summary(org_id uuid)
returns table (
  active_count bigint,
  overdue_count bigint,
  due_today_count bigint,
  completed_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where task.status in ('todo', 'in_progress')),
    count(*) filter (where task.status in ('todo', 'in_progress') and task.due_at < now()),
    count(*) filter (
      where task.status in ('todo', 'in_progress')
        and (task.due_at at time zone organization.timezone)::date = (now() at time zone organization.timezone)::date
    ),
    count(*) filter (where task.status = 'done')
  from public.tasks task
  join public.organizations organization on organization.id = task.organization_id
  where task.organization_id = org_id
    and public.current_user_has_permission(org_id, 'tasks.read');
$$;

create or replace function public.list_task_assignees(org_id uuid)
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
    and public.current_user_has_permission(org_id, 'tasks.read')
  order by 2;
$$;

create or replace function public.list_task_branches(org_id uuid)
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
    and public.current_user_has_permission(org_id, 'tasks.read')
  order by branch.name;
$$;

create or replace function public.list_task_relation_options(org_id uuid)
returns table (entity_type text, id uuid, label text, secondary text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'patient'::text, patient.id,
    concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name),
    '№ ' || patient.external_number || ' · ' || patient.phone
  from public.patients patient
  where patient.organization_id = org_id
    and patient.archived_at is null
    and public.current_user_has_permission(org_id, 'tasks.read')
    and public.current_user_has_permission(org_id, 'patients.read')
  union all
  select 'lead'::text, lead.id, lead.full_name, lead.phone
  from public.leads lead
  where lead.organization_id = org_id
    and lead.archived_at is null
    and public.current_user_has_permission(org_id, 'tasks.read')
    and public.current_user_has_permission(org_id, 'crm.read')
  order by 1, 3;
$$;

revoke all on function public.save_task(uuid, uuid, uuid, text, text, text, uuid, date, time without time zone, text, uuid) from public;
revoke all on function public.set_task_status(uuid, uuid, text) from public;
revoke all on function public.list_tasks(uuid, text, text, text, uuid, text, integer) from public;
revoke all on function public.get_task_summary(uuid) from public;
revoke all on function public.list_task_assignees(uuid) from public;
revoke all on function public.list_task_branches(uuid) from public;
revoke all on function public.list_task_relation_options(uuid) from public;

grant execute on function public.save_task(uuid, uuid, uuid, text, text, text, uuid, date, time without time zone, text, uuid) to authenticated;
grant execute on function public.set_task_status(uuid, uuid, text) to authenticated;
grant execute on function public.list_tasks(uuid, text, text, text, uuid, text, integer) to authenticated;
grant execute on function public.get_task_summary(uuid) to authenticated;
grant execute on function public.list_task_assignees(uuid) to authenticated;
grant execute on function public.list_task_branches(uuid) to authenticated;
grant execute on function public.list_task_relation_options(uuid) to authenticated;
