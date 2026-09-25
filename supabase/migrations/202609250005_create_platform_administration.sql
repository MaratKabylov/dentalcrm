alter table public.profiles
  add column platform_role text not null default 'user'
  check (platform_role in ('user', 'super_admin'));

alter table public.organizations
  add column access_until date not null default (current_date + 30),
  add column suspension_reason text,
  add column suspended_at timestamptz,
  add column suspended_by uuid references public.profiles(id) on delete set null;

create index profiles_platform_role_idx
  on public.profiles (platform_role)
  where platform_role = 'super_admin';
create index organizations_access_until_idx on public.organizations (access_until);

create or replace function public.current_user_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.platform_role = 'super_admin'
  );
$$;

revoke all on function public.current_user_is_super_admin() from public;
grant execute on function public.current_user_is_super_admin() to authenticated;

create or replace function public.protect_platform_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.platform_role is distinct from old.platform_role
    and auth.uid() is not null
    and not public.current_user_is_super_admin()
  then
    raise exception 'Only a super administrator can change the platform role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_platform_role
before update of platform_role on public.profiles
for each row execute function public.protect_platform_role();

create or replace function public.protect_organization_access_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (
    new.status is distinct from old.status
    or new.access_until is distinct from old.access_until
    or new.suspension_reason is distinct from old.suspension_reason
    or new.suspended_at is distinct from old.suspended_at
    or new.suspended_by is distinct from old.suspended_by
  )
    and auth.uid() is not null
    and not public.current_user_is_super_admin()
  then
    raise exception 'Only a super administrator can change organization access'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_protect_access_fields
before update of status, access_until, suspension_reason, suspended_at, suspended_by
on public.organizations
for each row execute function public.protect_organization_access_fields();

create or replace function public.organization_allows_writes(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select organization.status = 'active'
      and (current_timestamp at time zone organization.timezone)::date <= organization.access_until
    from public.organizations organization
    where organization.id = org_id
  ), false);
$$;

revoke all on function public.organization_allows_writes(uuid) from public;
grant execute on function public.organization_allows_writes(uuid) to authenticated;

create or replace function public.current_user_has_org_access(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and organization.status <> 'archived'
  );
$$;

create or replace function public.current_user_shares_organization(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    join public.organizations organization on organization.id = mine.organization_id
    where mine.user_id = auth.uid()
      and theirs.user_id = other_user_id
      and mine.status = 'active'
      and theirs.status = 'active'
      and organization.status <> 'archived'
  );
$$;

create or replace function public.current_user_has_permission(org_id uuid, permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    join public.member_roles member_role on member_role.organization_member_id = member.id
    join public.roles role on role.id = member_role.role_id
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
    where member.organization_id = org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and organization.status <> 'archived'
      and permission.code = permission_code
      and (role.is_system or role.organization_id = org_id)
      and (
        permission_code like '%.read'
        or public.organization_allows_writes(org_id)
      )
  );
$$;

drop policy organizations_select on public.organizations;
create policy organizations_select on public.organizations
for select to authenticated
using (
  public.current_user_is_super_admin()
  or public.current_user_has_org_access(id)
);

create table public.platform_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('access.updated', 'access.suspended', 'access.restored')),
  reason text,
  before_data jsonb not null,
  after_data jsonb not null,
  occurred_at timestamptz not null default now()
);

create index platform_admin_audit_logs_time_idx
  on public.platform_admin_audit_logs (occurred_at desc);
create index platform_admin_audit_logs_organization_time_idx
  on public.platform_admin_audit_logs (organization_id, occurred_at desc);

alter table public.platform_admin_audit_logs enable row level security;

create or replace function public.list_platform_organizations()
returns table (
  organization_id uuid,
  organization_name text,
  legal_name text,
  bin text,
  timezone text,
  organization_status text,
  access_until date,
  access_state text,
  suspension_reason text,
  member_count bigint,
  owner_name text,
  owner_email text,
  created_at timestamptz,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.current_user_is_super_admin() then
    raise exception 'Super administrator access required' using errcode = '42501';
  end if;

  return query
  select
    organization.id,
    organization.name,
    organization.legal_name,
    organization.bin,
    organization.timezone,
    organization.status,
    organization.access_until,
    case
      when organization.status = 'archived' then 'archived'
      when organization.status = 'suspended' then 'suspended'
      when (current_timestamp at time zone organization.timezone)::date > organization.access_until then 'expired'
      else 'active'
    end,
    organization.suspension_reason,
    (
      select count(*)
      from public.organization_members member
      where member.organization_id = organization.id
        and member.status = 'active'
    ),
    owner_profile.full_name,
    owner_user.email::text,
    organization.created_at,
    (
      select max(log.occurred_at)
      from public.audit_logs log
      where log.organization_id = organization.id
    )
  from public.organizations organization
  left join lateral (
    select member.user_id
    from public.organization_members member
    join public.member_roles member_role on member_role.organization_member_id = member.id
    join public.roles role on role.id = member_role.role_id
    where member.organization_id = organization.id
      and member.status = 'active'
      and role.code = 'owner'
    order by member.joined_at
    limit 1
  ) owner on true
  left join public.profiles owner_profile on owner_profile.id = owner.user_id
  left join auth.users owner_user on owner_user.id = owner.user_id
  order by organization.created_at desc;
end;
$$;

create or replace function public.list_platform_admin_audit_logs(result_limit integer default 20)
returns table (
  audit_id uuid,
  organization_id uuid,
  organization_name text,
  actor_name text,
  actor_email text,
  action text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.current_user_is_super_admin() then
    raise exception 'Super administrator access required' using errcode = '42501';
  end if;

  return query
  select
    log.id,
    log.organization_id,
    organization.name,
    profile.full_name,
    actor.email::text,
    log.action,
    log.reason,
    log.before_data,
    log.after_data,
    log.occurred_at
  from public.platform_admin_audit_logs log
  join public.organizations organization on organization.id = log.organization_id
  join public.profiles profile on profile.id = log.actor_user_id
  left join auth.users actor on actor.id = log.actor_user_id
  order by log.occurred_at desc
  limit greatest(1, least(coalesce(result_limit, 20), 100));
end;
$$;

create or replace function public.set_organization_access(
  org_id uuid,
  target_access_until date,
  target_mode text,
  change_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_organization public.organizations%rowtype;
  next_status text;
  audit_action text;
begin
  if actor_id is null or not public.current_user_is_super_admin() then
    raise exception 'Super administrator access required' using errcode = '42501';
  end if;
  if target_access_until is null then
    raise exception 'Access end date is required';
  end if;
  if target_mode not in ('active', 'read_only') then
    raise exception 'Invalid access mode';
  end if;
  if target_mode = 'read_only'
    and char_length(trim(coalesce(change_reason, ''))) not between 3 and 500
  then
    raise exception 'A suspension reason between 3 and 500 characters is required';
  end if;

  select * into target_organization
  from public.organizations
  where id = org_id
  for update;

  if not found then
    raise exception 'Organization not found';
  end if;
  if target_organization.status = 'archived' then
    raise exception 'Archived organization access cannot be changed';
  end if;
  if target_mode = 'active'
    and target_access_until < (current_timestamp at time zone target_organization.timezone)::date
  then
    raise exception 'Active access requires a current or future end date';
  end if;

  next_status := case when target_mode = 'read_only' then 'suspended' else 'active' end;
  audit_action := case
    when next_status = 'suspended' and target_organization.status <> 'suspended' then 'access.suspended'
    when next_status = 'active' and target_organization.status = 'suspended' then 'access.restored'
    else 'access.updated'
  end;

  update public.organizations
  set access_until = target_access_until,
      status = next_status,
      suspension_reason = case when next_status = 'suspended' then trim(change_reason) else null end,
      suspended_at = case when next_status = 'suspended' then now() else null end,
      suspended_by = case when next_status = 'suspended' then actor_id else null end
  where id = org_id;

  insert into public.platform_admin_audit_logs (
    organization_id,
    actor_user_id,
    action,
    reason,
    before_data,
    after_data
  ) values (
    org_id,
    actor_id,
    audit_action,
    nullif(trim(coalesce(change_reason, '')), ''),
    jsonb_build_object(
      'status', target_organization.status,
      'access_until', target_organization.access_until,
      'suspension_reason', target_organization.suspension_reason
    ),
    jsonb_build_object(
      'status', next_status,
      'access_until', target_access_until,
      'suspension_reason', case when next_status = 'suspended' then trim(change_reason) else null end
    )
  );
end;
$$;

revoke all on function public.list_platform_organizations() from public;
revoke all on function public.list_platform_admin_audit_logs(integer) from public;
revoke all on function public.set_organization_access(uuid, date, text, text) from public;
grant execute on function public.list_platform_organizations() to authenticated;
grant execute on function public.list_platform_admin_audit_logs(integer) to authenticated;
grant execute on function public.set_organization_access(uuid, date, text, text) to authenticated;

comment on column public.profiles.platform_role is
  'Platform-wide role. Bootstrap the first super administrator from the Supabase SQL editor.';
comment on column public.organizations.access_until is
  'Inclusive final day of write access in the organization timezone.';
