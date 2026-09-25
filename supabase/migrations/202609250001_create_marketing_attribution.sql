begin;

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_id uuid not null,
  branch_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 160),
  code text not null check (code ~ '^[a-z0-9_-]{2,60}$'),
  utm_source text check (utm_source is null or char_length(utm_source) <= 120),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 120),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 160),
  budget_amount numeric(14,2) not null default 0 check (budget_amount >= 0),
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaigns_dates_check check (ends_on is null or ends_on >= starts_on),
  constraint marketing_campaigns_source_fkey foreign key (organization_id, source_id)
    references public.patient_sources(organization_id, id) on delete restrict,
  constraint marketing_campaigns_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, code)
);

create index marketing_campaigns_period_idx
  on public.marketing_campaigns (organization_id, starts_on, ends_on);
create index marketing_campaigns_source_idx
  on public.marketing_campaigns (organization_id, source_id, is_active);

create trigger marketing_campaigns_set_updated_at
before update on public.marketing_campaigns
for each row execute function public.set_updated_at();

alter table public.leads
  add column campaign_id uuid,
  add column utm_source text check (utm_source is null or char_length(utm_source) <= 120),
  add column utm_medium text check (utm_medium is null or char_length(utm_medium) <= 120),
  add column utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 160),
  add column utm_content text check (utm_content is null or char_length(utm_content) <= 160),
  add column utm_term text check (utm_term is null or char_length(utm_term) <= 160),
  add column landing_page text check (landing_page is null or char_length(landing_page) <= 500),
  add constraint leads_campaign_fkey foreign key (organization_id, campaign_id)
    references public.marketing_campaigns(organization_id, id) on delete restrict;

create index leads_campaign_idx on public.leads (organization_id, campaign_id, created_at desc)
  where campaign_id is not null and archived_at is null;
create unique index leads_converted_patient_unique_idx
  on public.leads (organization_id, converted_patient_id)
  where converted_patient_id is not null and archived_at is null;

alter table public.marketing_campaigns enable row level security;

create policy marketing_campaigns_select on public.marketing_campaigns
for select to authenticated
using (public.current_user_has_permission(organization_id, 'crm.read'));

grant select on public.marketing_campaigns to authenticated;

create or replace function public.save_marketing_campaign(
  org_id uuid,
  target_campaign_id uuid,
  campaign_source_id uuid,
  campaign_branch_id uuid,
  campaign_name text,
  campaign_code text,
  campaign_utm_source text,
  campaign_utm_medium text,
  campaign_utm_campaign text,
  campaign_budget_amount numeric,
  campaign_starts_on date,
  campaign_ends_on date,
  campaign_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_campaign_id uuid;
  normalized_code text := lower(trim(campaign_code));
begin
  if not public.current_user_has_permission(org_id, 'crm.manage') then
    raise exception 'CRM manage permission required' using errcode = '42501';
  end if;
  if campaign_name is null or char_length(trim(campaign_name)) not between 2 and 160 then
    raise exception 'Campaign name is invalid';
  end if;
  if normalized_code is null or normalized_code !~ '^[a-z0-9_-]{2,60}$' then
    raise exception 'Campaign code is invalid';
  end if;
  if campaign_budget_amount is null or campaign_budget_amount < 0
    or round(campaign_budget_amount, 2) <> campaign_budget_amount
  then
    raise exception 'Campaign budget is invalid';
  end if;
  if campaign_starts_on is null or (campaign_ends_on is not null and campaign_ends_on < campaign_starts_on) then
    raise exception 'Campaign dates are invalid';
  end if;
  if not exists (
    select 1 from public.patient_sources source
    where source.organization_id = org_id and source.id = campaign_source_id
      and (source.is_active or target_campaign_id is not null)
  ) then
    raise exception 'Campaign source not found';
  end if;
  if campaign_branch_id is not null and not exists (
    select 1 from public.branches branch
    where branch.organization_id = org_id and branch.id = campaign_branch_id and branch.is_active
  ) then
    raise exception 'Active campaign branch not found';
  end if;

  if target_campaign_id is null then
    insert into public.marketing_campaigns (
      organization_id, source_id, branch_id, name, code,
      utm_source, utm_medium, utm_campaign, budget_amount,
      starts_on, ends_on, is_active, created_by
    ) values (
      org_id, campaign_source_id, campaign_branch_id, trim(campaign_name), normalized_code,
      nullif(trim(campaign_utm_source), ''), nullif(trim(campaign_utm_medium), ''),
      nullif(trim(campaign_utm_campaign), ''), campaign_budget_amount,
      campaign_starts_on, campaign_ends_on, campaign_is_active, auth.uid()
    ) returning id into saved_campaign_id;
  else
    if exists (
      select 1
      from public.marketing_campaigns campaign
      where campaign.organization_id = org_id and campaign.id = target_campaign_id
        and (campaign.source_id <> campaign_source_id or campaign.branch_id is distinct from campaign_branch_id)
        and exists (
          select 1 from public.leads lead
          where lead.organization_id = org_id and lead.campaign_id = campaign.id
        )
    ) then
      raise exception 'Source or branch cannot change after campaign attribution';
    end if;

    update public.marketing_campaigns
    set source_id = campaign_source_id,
        branch_id = campaign_branch_id,
        name = trim(campaign_name),
        code = normalized_code,
        utm_source = nullif(trim(campaign_utm_source), ''),
        utm_medium = nullif(trim(campaign_utm_medium), ''),
        utm_campaign = nullif(trim(campaign_utm_campaign), ''),
        budget_amount = campaign_budget_amount,
        starts_on = campaign_starts_on,
        ends_on = campaign_ends_on,
        is_active = campaign_is_active
    where organization_id = org_id and id = target_campaign_id
    returning id into saved_campaign_id;
    if saved_campaign_id is null then raise exception 'Campaign not found'; end if;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(),
    case when target_campaign_id is null then 'marketing_campaign.created' else 'marketing_campaign.updated' end,
    'marketing_campaign', saved_campaign_id,
    jsonb_build_object(
      'source_id', campaign_source_id,
      'branch_id', campaign_branch_id,
      'budget_amount', campaign_budget_amount,
      'starts_on', campaign_starts_on,
      'ends_on', campaign_ends_on,
      'is_active', campaign_is_active
    )
  );
  return saved_campaign_id;
end;
$$;

create or replace function public.set_marketing_campaign_active(
  org_id uuid,
  target_campaign_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'crm.manage') then
    raise exception 'CRM manage permission required' using errcode = '42501';
  end if;
  update public.marketing_campaigns
  set is_active = target_is_active
  where organization_id = org_id and id = target_campaign_id;
  if not found then raise exception 'Campaign not found'; end if;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'marketing_campaign.activity_changed', 'marketing_campaign', target_campaign_id,
    jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

create or replace function public.save_attributed_lead(
  org_id uuid,
  target_lead_id uuid,
  lead_branch_id uuid,
  lead_full_name text,
  lead_phone text,
  lead_email text,
  lead_source_id uuid,
  lead_assigned_to uuid,
  lead_notes text,
  lead_campaign_id uuid,
  lead_utm_source text,
  lead_utm_medium text,
  lead_utm_campaign text,
  lead_utm_content text,
  lead_utm_term text,
  lead_landing_page text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_lead_id uuid;
  resolved_source_id uuid;
  campaign_source_id uuid;
  campaign_branch_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'crm.manage') then
    raise exception 'CRM manage permission required' using errcode = '42501';
  end if;
  if lead_full_name is null or char_length(trim(lead_full_name)) not between 2 and 200 then
    raise exception 'Lead name is invalid';
  end if;
  if lead_phone is null or char_length(public.normalize_phone(lead_phone)) not between 5 and 15 then
    raise exception 'Lead phone is invalid';
  end if;
  if lead_branch_id is not null and not exists (
    select 1 from public.branches where organization_id = org_id and id = lead_branch_id and is_active
  ) then raise exception 'Active branch not found'; end if;
  if lead_assigned_to is not null and not exists (
    select 1 from public.organization_members
    where organization_id = org_id and id = lead_assigned_to and status = 'active'
  ) then raise exception 'Active assignee not found'; end if;

  select source.id into resolved_source_id
  from public.patient_sources source
  where source.organization_id = org_id
    and source.id = coalesce(lead_source_id, source.id)
    and (
      source.is_active
      or exists (
        select 1 from public.leads current_lead
        where current_lead.organization_id = org_id
          and current_lead.id = target_lead_id
          and current_lead.source_id = source.id
      )
    )
    and (lead_source_id is not null or source.code = 'unknown')
  order by case when source.code = 'unknown' then 0 else 1 end
  limit 1;
  if resolved_source_id is null then raise exception 'Active source not found'; end if;

  if lead_campaign_id is not null then
    select campaign.source_id, campaign.branch_id
    into campaign_source_id, campaign_branch_id
    from public.marketing_campaigns campaign
    where campaign.organization_id = org_id and campaign.id = lead_campaign_id
      and (
        campaign.is_active
        or exists (
          select 1 from public.leads current_lead
          where current_lead.organization_id = org_id
            and current_lead.id = target_lead_id
            and current_lead.campaign_id = campaign.id
        )
      );
    if campaign_source_id is null then raise exception 'Campaign not found'; end if;
    if campaign_source_id <> resolved_source_id then raise exception 'Campaign source does not match lead source'; end if;
    if campaign_branch_id is not null and campaign_branch_id is distinct from lead_branch_id then
      raise exception 'Campaign branch does not match lead branch';
    end if;
  end if;

  if target_lead_id is null then
    insert into public.leads (
      organization_id, branch_id, full_name, phone, phone_normalized, email,
      source_id, assigned_to, notes, campaign_id, utm_source, utm_medium,
      utm_campaign, utm_content, utm_term, landing_page
    ) values (
      org_id, lead_branch_id, lead_full_name, lead_phone, public.normalize_phone(lead_phone), lead_email,
      resolved_source_id, lead_assigned_to, lead_notes, lead_campaign_id,
      nullif(trim(lead_utm_source), ''), nullif(trim(lead_utm_medium), ''),
      nullif(trim(lead_utm_campaign), ''), nullif(trim(lead_utm_content), ''),
      nullif(trim(lead_utm_term), ''), nullif(trim(lead_landing_page), '')
    ) returning id into saved_lead_id;

    insert into public.lead_activities (organization_id, lead_id, type, body, employee_id)
    values (org_id, saved_lead_id, 'note', 'Лид создан', auth.uid());
  else
    update public.leads
    set branch_id = lead_branch_id,
        full_name = lead_full_name,
        phone = lead_phone,
        email = lead_email,
        source_id = resolved_source_id,
        assigned_to = lead_assigned_to,
        notes = lead_notes,
        campaign_id = lead_campaign_id,
        utm_source = nullif(trim(lead_utm_source), ''),
        utm_medium = nullif(trim(lead_utm_medium), ''),
        utm_campaign = nullif(trim(lead_utm_campaign), ''),
        utm_content = nullif(trim(lead_utm_content), ''),
        utm_term = nullif(trim(lead_utm_term), ''),
        landing_page = nullif(trim(lead_landing_page), '')
    where organization_id = org_id and id = target_lead_id and archived_at is null
    returning id into saved_lead_id;
    if saved_lead_id is null then raise exception 'Lead not found'; end if;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(),
    case when target_lead_id is null then 'lead.created' else 'lead.updated' end,
    'lead', saved_lead_id,
    jsonb_build_object(
      'source_id', resolved_source_id,
      'campaign_id', lead_campaign_id,
      'branch_id', lead_branch_id,
      'assigned_to', lead_assigned_to
    )
  );
  return saved_lead_id;
end;
$$;

create or replace function public.convert_lead_to_patient(
  org_id uuid,
  target_lead_id uuid,
  target_patient_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_status text;
  existing_patient_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'crm.manage')
    or not public.current_user_has_permission(org_id, 'patients.read')
  then
    raise exception 'CRM manage and patient read permissions required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.patients patient
    where patient.organization_id = org_id and patient.id = target_patient_id and patient.archived_at is null
  ) then raise exception 'Patient not found'; end if;

  select lead.status, lead.converted_patient_id
  into previous_status, existing_patient_id
  from public.leads lead
  where lead.organization_id = org_id and lead.id = target_lead_id and lead.archived_at is null
  for update;
  if previous_status is null then raise exception 'Lead not found'; end if;
  if previous_status = 'converted' and existing_patient_id = target_patient_id then return; end if;
  if previous_status = 'converted' then raise exception 'Lead is already linked to another patient'; end if;

  update public.leads
  set status = 'converted', converted_patient_id = target_patient_id
  where organization_id = org_id and id = target_lead_id;

  insert into public.lead_activities (organization_id, lead_id, type, body, employee_id)
  values (org_id, target_lead_id, 'status_change', previous_status || ' → converted', auth.uid());
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    org_id, auth.uid(), 'lead.converted', 'lead', target_lead_id,
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', 'converted', 'patient_id', target_patient_id)
  );
end;
$$;

create or replace function public.create_patient_from_lead(
  org_id uuid,
  target_lead_id uuid,
  patient_last_name text,
  patient_first_name text,
  patient_middle_name text default null,
  patient_birth_date date default null,
  patient_gender text default null,
  patient_phone text default '',
  patient_iin text default null,
  patient_email text default null,
  patient_primary_branch_id uuid default null,
  patient_consent_personal_data boolean default false,
  patient_consent_marketing boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_status text;
  new_patient_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'crm.manage')
    or not public.current_user_has_permission(org_id, 'patients.create')
  then
    raise exception 'CRM manage and patient create permissions required' using errcode = '42501';
  end if;

  select lead.status into previous_status
  from public.leads lead
  where lead.organization_id = org_id and lead.id = target_lead_id and lead.archived_at is null
  for update;
  if previous_status is null then raise exception 'Lead not found'; end if;
  if previous_status = 'converted' then raise exception 'Lead is already converted'; end if;

  select public.create_patient(
    org_id,
    patient_last_name,
    patient_first_name,
    patient_middle_name,
    patient_birth_date,
    patient_gender,
    patient_phone,
    patient_iin,
    patient_email,
    patient_primary_branch_id,
    patient_consent_personal_data,
    patient_consent_marketing
  ) into new_patient_id;

  update public.leads
  set status = 'converted', converted_patient_id = new_patient_id
  where organization_id = org_id and id = target_lead_id;
  insert into public.lead_activities (organization_id, lead_id, type, body, employee_id)
  values (org_id, target_lead_id, 'status_change', previous_status || ' → converted', auth.uid());
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    org_id, auth.uid(), 'lead.converted', 'lead', target_lead_id,
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', 'converted', 'patient_id', new_patient_id)
  );
  return new_patient_id;
end;
$$;

create or replace function public.list_marketing_campaigns(
  org_id uuid,
  include_inactive boolean default false
)
returns table (
  id uuid,
  source_id uuid,
  source_name text,
  source_color text,
  branch_id uuid,
  branch_name text,
  name text,
  code text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  budget_amount numeric,
  starts_on date,
  ends_on date,
  is_active boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    campaign.id,
    campaign.source_id,
    source.name,
    source.color,
    campaign.branch_id,
    branch.name,
    campaign.name,
    campaign.code,
    campaign.utm_source,
    campaign.utm_medium,
    campaign.utm_campaign,
    campaign.budget_amount,
    campaign.starts_on,
    campaign.ends_on,
    campaign.is_active
  from public.marketing_campaigns campaign
  join public.patient_sources source
    on source.organization_id = campaign.organization_id and source.id = campaign.source_id
  left join public.branches branch
    on branch.organization_id = campaign.organization_id and branch.id = campaign.branch_id
  where campaign.organization_id = org_id
    and public.current_user_has_permission(org_id, 'crm.read')
    and (campaign.is_active or include_inactive and public.current_user_has_permission(org_id, 'crm.manage'))
  order by campaign.starts_on desc, campaign.name;
$$;

create or replace function public.get_lead_attribution(
  org_id uuid,
  target_lead_id uuid
)
returns table (
  campaign_id uuid,
  campaign_name text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_page text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    lead.campaign_id,
    campaign.name,
    lead.utm_source,
    lead.utm_medium,
    lead.utm_campaign,
    lead.utm_content,
    lead.utm_term,
    lead.landing_page
  from public.leads lead
  left join public.marketing_campaigns campaign
    on campaign.organization_id = lead.organization_id and campaign.id = lead.campaign_id
  where lead.organization_id = org_id
    and lead.id = target_lead_id
    and lead.archived_at is null
    and public.current_user_has_permission(org_id, 'crm.read');
$$;

create or replace function public.list_marketing_attribution(
  org_id uuid,
  report_start date,
  report_end date,
  source_filter uuid default null,
  branch_filter uuid default null
)
returns table (
  campaign_id uuid,
  campaign_name text,
  source_id uuid,
  source_name text,
  source_color text,
  branch_id uuid,
  branch_name text,
  budget_amount numeric,
  leads_count bigint,
  converted_count bigint,
  appointments_count bigint,
  completed_appointments_count bigint,
  revenue_amount numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  organization_timezone text;
begin
  if not public.current_user_has_permission(org_id, 'crm.read')
    or not public.current_user_has_permission(org_id, 'reports.read')
  then
    raise exception 'CRM and reports read permissions required' using errcode = '42501';
  end if;
  if report_start is null or report_end is null or report_end < report_start
    or report_end - report_start > 366
  then
    raise exception 'Report period is invalid';
  end if;
  select organization.timezone into organization_timezone
  from public.organizations organization where organization.id = org_id;

  return query
  with cohort as (
    select lead.*
    from public.leads lead
    where lead.organization_id = org_id
      and lead.archived_at is null
      and lead.created_at >= (report_start::timestamp at time zone organization_timezone)
      and lead.created_at < ((report_end + 1)::timestamp at time zone organization_timezone)
      and (source_filter is null or lead.source_id = source_filter)
      and (branch_filter is null or lead.branch_id = branch_filter)
  ),
  lead_metrics as (
    select
      lead.id,
      lead.campaign_id,
      lead.source_id,
      lead.branch_id,
      (lead.converted_patient_id is not null)::integer as converted,
      coalesce(appointment_metrics.total, 0)::bigint as appointments,
      coalesce(appointment_metrics.completed, 0)::bigint as completed_appointments,
      coalesce(payment_metrics.revenue, 0)::numeric as revenue
    from cohort lead
    left join lateral (
      select
        count(*)::bigint as total,
        count(*) filter (where status.code = 'completed')::bigint as completed
      from public.appointments appointment
      join public.appointment_statuses status
        on status.organization_id = appointment.organization_id and status.id = appointment.status_id
      where appointment.organization_id = lead.organization_id
        and appointment.patient_id = lead.converted_patient_id
        and appointment.created_at >= lead.created_at
    ) appointment_metrics on lead.converted_patient_id is not null
    left join lateral (
      select coalesce(sum(payment.amount - payment.refunded_amount), 0)::numeric as revenue
      from public.payments payment
      where payment.organization_id = lead.organization_id
        and payment.patient_id = lead.converted_patient_id
        and payment.paid_at >= lead.created_at
        and payment.status <> 'reversed'
    ) payment_metrics on lead.converted_patient_id is not null
  ),
  report_rows as (
    select
      campaign.id as campaign_id,
      campaign.name as campaign_name,
      campaign.source_id,
      source.name as source_name,
      source.color as source_color,
      campaign.branch_id,
      branch.name as branch_name,
      campaign.budget_amount,
      count(metrics.id)::bigint as leads_count,
      coalesce(sum(metrics.converted), 0)::bigint as converted_count,
      coalesce(sum(metrics.appointments), 0)::bigint as appointments_count,
      coalesce(sum(metrics.completed_appointments), 0)::bigint as completed_appointments_count,
      coalesce(sum(metrics.revenue), 0)::numeric as revenue_amount
    from public.marketing_campaigns campaign
    join public.patient_sources source
      on source.organization_id = campaign.organization_id and source.id = campaign.source_id
    left join public.branches branch
      on branch.organization_id = campaign.organization_id and branch.id = campaign.branch_id
    left join lead_metrics metrics on metrics.campaign_id = campaign.id
    where campaign.organization_id = org_id
      and campaign.starts_on <= report_end
      and (campaign.ends_on is null or campaign.ends_on >= report_start)
      and (source_filter is null or campaign.source_id = source_filter)
      and (branch_filter is null or campaign.branch_id is null or campaign.branch_id = branch_filter)
    group by campaign.id, source.name, source.color, branch.name

    union all

    select
      null::uuid,
      'Без кампании'::text,
      metrics.source_id,
      source.name,
      source.color,
      metrics.branch_id,
      branch.name,
      0::numeric,
      count(metrics.id)::bigint,
      coalesce(sum(metrics.converted), 0)::bigint,
      coalesce(sum(metrics.appointments), 0)::bigint,
      coalesce(sum(metrics.completed_appointments), 0)::bigint,
      coalesce(sum(metrics.revenue), 0)::numeric
    from lead_metrics metrics
    join public.patient_sources source
      on source.organization_id = org_id and source.id = metrics.source_id
    left join public.branches branch
      on branch.organization_id = org_id and branch.id = metrics.branch_id
    where metrics.campaign_id is null
    group by metrics.source_id, source.name, source.color, metrics.branch_id, branch.name
  )
  select
    report_row.campaign_id,
    report_row.campaign_name,
    report_row.source_id,
    report_row.source_name,
    report_row.source_color,
    report_row.branch_id,
    report_row.branch_name,
    report_row.budget_amount,
    report_row.leads_count,
    report_row.converted_count,
    report_row.appointments_count,
    report_row.completed_appointments_count,
    report_row.revenue_amount
  from report_rows report_row
  order by report_row.revenue_amount desc, report_row.leads_count desc, report_row.campaign_name;
end;
$$;

revoke all on function public.save_marketing_campaign(uuid, uuid, uuid, uuid, text, text, text, text, text, numeric, date, date, boolean) from public;
revoke all on function public.set_marketing_campaign_active(uuid, uuid, boolean) from public;
revoke all on function public.save_attributed_lead(uuid, uuid, uuid, text, text, text, uuid, uuid, text, uuid, text, text, text, text, text, text) from public;
revoke all on function public.convert_lead_to_patient(uuid, uuid, uuid) from public;
revoke all on function public.create_patient_from_lead(uuid, uuid, text, text, text, date, text, text, text, text, uuid, boolean, boolean) from public;
revoke all on function public.list_marketing_campaigns(uuid, boolean) from public;
revoke all on function public.get_lead_attribution(uuid, uuid) from public;
revoke all on function public.list_marketing_attribution(uuid, date, date, uuid, uuid) from public;

grant execute on function public.save_marketing_campaign(uuid, uuid, uuid, uuid, text, text, text, text, text, numeric, date, date, boolean) to authenticated;
grant execute on function public.set_marketing_campaign_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.save_attributed_lead(uuid, uuid, uuid, text, text, text, uuid, uuid, text, uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.convert_lead_to_patient(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_patient_from_lead(uuid, uuid, text, text, text, date, text, text, text, text, uuid, boolean, boolean) to authenticated;
grant execute on function public.list_marketing_campaigns(uuid, boolean) to authenticated;
grant execute on function public.get_lead_attribution(uuid, uuid) to authenticated;
grant execute on function public.list_marketing_attribution(uuid, date, date, uuid, uuid) to authenticated;

commit;
