-- Добавляет provider-neutral коммуникации: шаблоны сообщений, очередь исходящих,
-- журнал входящих/исходящих событий, статусы доставки, RLS, аудит и RPC для CRM.

insert into public.permissions (code, description) values
  ('communications.read', 'Просмотр коммуникаций'),
  ('communications.manage', 'Управление коммуникациями и шаблонами')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = any(array['communications.read', 'communications.manage'])
where role.organization_id is null
  and role.code = any(array['owner', 'administrator', 'receptionist', 'marketer', 'manager'])
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'communications.read'
where role.organization_id is null
  and role.code = any(array['doctor', 'assistant', 'auditor'])
on conflict do nothing;

create table public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  category text not null default 'general' check (category in (
    'general', 'appointment', 'recall', 'marketing'
  )),
  channel text check (channel is null or channel in ('sms', 'whatsapp', 'telegram', 'email', 'push')),
  subject text check (subject is null or char_length(subject) <= 240),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index communication_templates_name_idx
  on public.communication_templates (organization_id, lower(name));
create index communication_templates_active_idx
  on public.communication_templates (organization_id, is_active, category, name);

create table public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid,
  lead_id uuid,
  template_id uuid,
  channel text not null check (channel in ('sms', 'whatsapp', 'telegram', 'email', 'push')),
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null check (char_length(trim(provider)) between 2 and 80),
  provider_message_id text,
  status text not null check (status in (
    'queued', 'sending', 'sent', 'delivered', 'failed', 'received', 'cancelled'
  )),
  recipient text not null check (char_length(trim(recipient)) between 2 and 320),
  subject text check (subject is null or char_length(subject) <= 240),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_by uuid references public.profiles(id) on delete restrict,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text check (error_message is null or char_length(error_message) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_messages_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint communication_messages_lead_fkey foreign key (organization_id, lead_id)
    references public.leads(organization_id, id) on delete restrict,
  constraint communication_messages_template_fkey foreign key (organization_id, template_id)
    references public.communication_templates(organization_id, id) on delete restrict,
  constraint communication_messages_target_check check (
    (patient_id is not null and lead_id is null)
    or (patient_id is null and lead_id is not null)
  ),
  constraint communication_messages_direction_status_check check (
    (direction = 'inbound' and status = 'received')
    or (direction = 'outbound' and status <> 'received')
  ),
  unique (organization_id, id)
);

create unique index communication_messages_provider_id_idx
  on public.communication_messages (organization_id, provider, provider_message_id)
  where provider_message_id is not null;
create index communication_messages_timeline_idx
  on public.communication_messages (organization_id, created_at desc);
create index communication_messages_queue_idx
  on public.communication_messages (organization_id, status, queued_at)
  where direction = 'outbound' and status in ('queued', 'failed');
create index communication_messages_patient_idx
  on public.communication_messages (organization_id, patient_id, created_at desc)
  where patient_id is not null;
create index communication_messages_lead_idx
  on public.communication_messages (organization_id, lead_id, created_at desc)
  where lead_id is not null;

create or replace function public.normalize_communication_template_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.name = trim(new.name);
  new.subject = nullif(trim(new.subject), '');
  new.body = trim(new.body);
  return new;
end;
$$;

create trigger communication_templates_normalize_fields
before insert or update of name, subject, body on public.communication_templates
for each row execute function public.normalize_communication_template_fields();

create trigger communication_templates_set_updated_at
before update on public.communication_templates
for each row execute function public.set_updated_at();

create or replace function public.normalize_communication_message_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.provider = lower(trim(new.provider));
  new.provider_message_id = nullif(trim(new.provider_message_id), '');
  new.recipient = trim(new.recipient);
  new.subject = nullif(trim(new.subject), '');
  new.body = trim(new.body);
  new.error_message = nullif(trim(new.error_message), '');
  return new;
end;
$$;

create trigger communication_messages_normalize_fields
before insert or update on public.communication_messages
for each row execute function public.normalize_communication_message_fields();

create trigger communication_messages_set_updated_at
before update on public.communication_messages
for each row execute function public.set_updated_at();

alter table public.communication_templates enable row level security;
alter table public.communication_messages enable row level security;

create policy communication_templates_select on public.communication_templates
for select to authenticated
using (public.current_user_has_permission(organization_id, 'communications.read'));

create policy communication_messages_select on public.communication_messages
for select to authenticated
using (public.current_user_has_permission(organization_id, 'communications.read'));

grant select on public.communication_templates, public.communication_messages to authenticated;

create or replace function public.save_communication_template(
  org_id uuid,
  target_template_id uuid,
  template_name text,
  template_category text,
  template_channel text,
  template_subject text,
  template_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_template_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'communications.manage') then
    raise exception 'Communication manage permission required' using errcode = '42501';
  end if;
  if template_name is null or char_length(trim(template_name)) not between 2 and 160 then
    raise exception 'Template name is invalid';
  end if;
  if template_category not in ('general', 'appointment', 'recall', 'marketing') then
    raise exception 'Template category is invalid';
  end if;
  if template_channel is not null and template_channel not in ('sms', 'whatsapp', 'telegram', 'email', 'push') then
    raise exception 'Template channel is invalid';
  end if;
  if template_subject is not null and char_length(trim(template_subject)) > 240 then
    raise exception 'Template subject is invalid';
  end if;
  if template_body is null or char_length(trim(template_body)) not between 1 and 5000 then
    raise exception 'Template body is invalid';
  end if;

  if target_template_id is null then
    insert into public.communication_templates (
      organization_id, name, category, channel, subject, body, created_by
    ) values (
      org_id, template_name, template_category, template_channel,
      template_subject, template_body, auth.uid()
    ) returning id into saved_template_id;
  else
    update public.communication_templates
    set name = template_name,
        category = template_category,
        channel = template_channel,
        subject = template_subject,
        body = template_body
    where organization_id = org_id and id = target_template_id
    returning id into saved_template_id;
    if saved_template_id is null then raise exception 'Communication template not found'; end if;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(),
    case when target_template_id is null then 'communication_template.created' else 'communication_template.updated' end,
    'communication_template', saved_template_id,
    jsonb_build_object('name', trim(template_name), 'category', template_category, 'channel', template_channel)
  );
  return saved_template_id;
end;
$$;

create or replace function public.set_communication_template_active(
  org_id uuid,
  target_template_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'communications.manage') then
    raise exception 'Communication manage permission required' using errcode = '42501';
  end if;
  update public.communication_templates
  set is_active = target_is_active
  where organization_id = org_id and id = target_template_id;
  if not found then raise exception 'Communication template not found'; end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'communication_template.activity_changed',
    'communication_template', target_template_id,
    jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

create or replace function public.queue_communication_message(
  org_id uuid,
  target_type text,
  target_id uuid,
  message_channel text,
  message_recipient text,
  message_subject text,
  message_body text,
  source_template_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_message_id uuid;
  resolved_patient_id uuid;
  resolved_lead_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'communications.manage') then
    raise exception 'Communication manage permission required' using errcode = '42501';
  end if;
  if target_type not in ('patient', 'lead') then raise exception 'Target type is invalid'; end if;
  if message_channel not in ('sms', 'whatsapp', 'telegram', 'email', 'push') then
    raise exception 'Communication channel is invalid';
  end if;
  if message_recipient is null or char_length(trim(message_recipient)) not between 2 and 320 then
    raise exception 'Recipient is invalid';
  end if;
  if message_subject is not null and char_length(trim(message_subject)) > 240 then
    raise exception 'Subject is invalid';
  end if;
  if message_body is null or char_length(trim(message_body)) not between 1 and 5000 then
    raise exception 'Message body is invalid';
  end if;
  if source_template_id is not null and not exists (
    select 1 from public.communication_templates template
    where template.organization_id = org_id
      and template.id = source_template_id
      and template.is_active
      and (template.channel is null or template.channel = message_channel)
  ) then raise exception 'Active compatible template not found'; end if;

  if target_type = 'patient' then
    select patient.id into resolved_patient_id
    from public.patients patient
    where patient.organization_id = org_id and patient.id = target_id and patient.archived_at is null;
    if resolved_patient_id is null then raise exception 'Patient not found'; end if;
  else
    select lead.id into resolved_lead_id
    from public.leads lead
    where lead.organization_id = org_id and lead.id = target_id and lead.archived_at is null;
    if resolved_lead_id is null then raise exception 'Lead not found'; end if;
  end if;

  insert into public.communication_messages (
    organization_id, patient_id, lead_id, template_id, channel, direction,
    provider, status, recipient, subject, body, created_by, queued_at
  ) values (
    org_id, resolved_patient_id, resolved_lead_id, source_template_id,
    message_channel, 'outbound', 'unassigned', 'queued', message_recipient,
    message_subject, message_body, auth.uid(), now()
  ) returning id into new_message_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'communication.queued', 'communication_message', new_message_id,
    jsonb_build_object(
      'target_type', target_type,
      'target_id', target_id,
      'channel', message_channel,
      'recipient', trim(message_recipient)
    )
  );
  return new_message_id;
end;
$$;

create or replace function public.record_inbound_communication(
  org_id uuid,
  target_type text,
  target_id uuid,
  message_channel text,
  message_provider text,
  external_message_id text,
  message_recipient text,
  message_subject text,
  message_body text,
  received_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_message_id uuid;
  resolved_patient_id uuid;
  resolved_lead_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_type not in ('patient', 'lead') then raise exception 'Target type is invalid'; end if;
  if message_channel not in ('sms', 'whatsapp', 'telegram', 'email', 'push') then
    raise exception 'Communication channel is invalid';
  end if;
  if message_provider is null or char_length(trim(message_provider)) not between 2 and 80 then
    raise exception 'Provider is invalid';
  end if;
  if message_recipient is null or char_length(trim(message_recipient)) not between 2 and 320 then
    raise exception 'Recipient is invalid';
  end if;
  if message_body is null or char_length(trim(message_body)) not between 1 and 5000 then
    raise exception 'Message body is invalid';
  end if;

  if target_type = 'patient' then
    select id into resolved_patient_id from public.patients
    where organization_id = org_id and id = target_id;
    if resolved_patient_id is null then raise exception 'Patient not found'; end if;
  else
    select id into resolved_lead_id from public.leads
    where organization_id = org_id and id = target_id;
    if resolved_lead_id is null then raise exception 'Lead not found'; end if;
  end if;

  insert into public.communication_messages (
    organization_id, patient_id, lead_id, channel, direction, provider,
    provider_message_id, status, recipient, subject, body, created_at
  ) values (
    org_id, resolved_patient_id, resolved_lead_id, message_channel, 'inbound',
    message_provider, external_message_id, 'received', message_recipient,
    message_subject, message_body, coalesce(received_at, now())
  )
  on conflict (organization_id, provider, provider_message_id)
    where provider_message_id is not null
  do update set updated_at = public.communication_messages.updated_at
  returning id into new_message_id;
  return new_message_id;
end;
$$;

create or replace function public.update_communication_delivery(
  org_id uuid,
  target_message_id uuid,
  message_provider text,
  external_message_id text,
  target_status text,
  delivery_error text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_status not in ('sending', 'sent', 'delivered', 'failed', 'cancelled') then
    raise exception 'Delivery status is invalid';
  end if;

  update public.communication_messages
  set provider = message_provider,
      provider_message_id = coalesce(external_message_id, provider_message_id),
      status = target_status,
      sent_at = case when target_status in ('sent', 'delivered') then coalesce(sent_at, now()) else sent_at end,
      delivered_at = case when target_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      error_message = case when target_status = 'failed' then delivery_error else null end
  where organization_id = org_id
    and id = target_message_id
    and direction = 'outbound';
  if not found then raise exception 'Outbound message not found'; end if;
end;
$$;

create or replace function public.list_communication_templates(
  org_id uuid,
  include_inactive boolean default false
)
returns table (
  id uuid,
  name text,
  category text,
  channel text,
  subject text,
  body text,
  is_active boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select template.id, template.name, template.category, template.channel,
    template.subject, template.body, template.is_active, template.updated_at
  from public.communication_templates template
  where template.organization_id = org_id
    and public.current_user_has_permission(org_id, 'communications.read')
    and (template.is_active or include_inactive and public.current_user_has_permission(org_id, 'communications.manage'))
  order by template.is_active desc, template.category, template.name;
$$;

create or replace function public.list_communication_targets(org_id uuid)
returns table (
  target_type text,
  id uuid,
  label text,
  phone text,
  email text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'patient'::text, patient.id,
    concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name),
    patient.phone, patient.email
  from public.patients patient
  where patient.organization_id = org_id
    and patient.archived_at is null
    and public.current_user_has_permission(org_id, 'communications.read')
    and public.current_user_has_permission(org_id, 'patients.read')
  union all
  select 'lead'::text, lead.id, lead.full_name, lead.phone, lead.email
  from public.leads lead
  where lead.organization_id = org_id
    and lead.archived_at is null
    and public.current_user_has_permission(org_id, 'communications.read')
    and public.current_user_has_permission(org_id, 'crm.read')
  order by 1, 3;
$$;

create or replace function public.list_communication_messages(
  org_id uuid,
  search_query text default null,
  channel_filter text default null,
  direction_filter text default null,
  status_filter text default null,
  result_limit integer default 300
)
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  target_name text,
  channel text,
  direction text,
  provider text,
  provider_message_id text,
  status text,
  recipient text,
  subject text,
  body text,
  creator_name text,
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    message.id,
    case when message.patient_id is not null then 'patient' else 'lead' end,
    coalesce(message.patient_id, message.lead_id),
    case
      when message.patient_id is not null then concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name)
      else lead.full_name
    end,
    message.channel,
    message.direction,
    message.provider,
    message.provider_message_id,
    message.status,
    message.recipient,
    message.subject,
    message.body,
    coalesce(nullif(trim(profile.full_name), ''), case when message.created_by is null then null else 'Сотрудник' end),
    message.sent_at,
    message.delivered_at,
    message.error_message,
    message.created_at
  from public.communication_messages message
  left join public.patients patient
    on patient.organization_id = message.organization_id and patient.id = message.patient_id
  left join public.leads lead
    on lead.organization_id = message.organization_id and lead.id = message.lead_id
  left join public.profiles profile on profile.id = message.created_by
  where message.organization_id = org_id
    and public.current_user_has_permission(org_id, 'communications.read')
    and (nullif(trim(channel_filter), '') is null or channel_filter = 'all' or message.channel = channel_filter)
    and (nullif(trim(direction_filter), '') is null or direction_filter = 'all' or message.direction = direction_filter)
    and (nullif(trim(status_filter), '') is null or status_filter = 'all' or message.status = status_filter)
    and (
      nullif(trim(search_query), '') is null
      or message.recipient ilike '%' || trim(search_query) || '%'
      or message.subject ilike '%' || trim(search_query) || '%'
      or message.body ilike '%' || trim(search_query) || '%'
      or concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name) ilike '%' || trim(search_query) || '%'
      or lead.full_name ilike '%' || trim(search_query) || '%'
    )
  order by message.created_at desc
  limit least(greatest(result_limit, 1), 500);
$$;

create or replace function public.get_communication_summary(org_id uuid)
returns table (
  queued_count bigint,
  sent_count bigint,
  failed_count bigint,
  received_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where message.status in ('queued', 'sending')),
    count(*) filter (where message.status in ('sent', 'delivered')),
    count(*) filter (where message.status = 'failed'),
    count(*) filter (where message.status = 'received')
  from public.communication_messages message
  where message.organization_id = org_id
    and public.current_user_has_permission(org_id, 'communications.read');
$$;

revoke all on function public.save_communication_template(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.set_communication_template_active(uuid, uuid, boolean) from public;
revoke all on function public.queue_communication_message(uuid, text, uuid, text, text, text, text, uuid) from public;
revoke all on function public.record_inbound_communication(uuid, text, uuid, text, text, text, text, text, text, timestamptz) from public;
revoke all on function public.update_communication_delivery(uuid, uuid, text, text, text, text) from public;
revoke all on function public.list_communication_templates(uuid, boolean) from public;
revoke all on function public.list_communication_targets(uuid) from public;
revoke all on function public.list_communication_messages(uuid, text, text, text, text, integer) from public;
revoke all on function public.get_communication_summary(uuid) from public;

grant execute on function public.save_communication_template(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.set_communication_template_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.queue_communication_message(uuid, text, uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.record_inbound_communication(uuid, text, uuid, text, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.update_communication_delivery(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.list_communication_templates(uuid, boolean) to authenticated;
grant execute on function public.list_communication_targets(uuid) to authenticated;
grant execute on function public.list_communication_messages(uuid, text, text, text, text, integer) to authenticated;
grant execute on function public.get_communication_summary(uuid) to authenticated;
