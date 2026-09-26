begin;

insert into public.permissions (code, description) values
  ('branches.manage', 'Управление филиалами'),
  ('branch_access.manage', 'Управление доступом пользователей к филиалам'),
  ('directories.manage_global', 'Управление общими справочниками организации'),
  ('directories.manage_branch', 'Управление справочниками доступных филиалов')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.organization_id is null
  and role.code = 'owner'
  and permission.code in (
    'branches.manage',
    'branch_access.manage',
    'directories.manage_global',
    'directories.manage_branch'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = any(array[
  'branches.manage',
  'branch_access.manage',
  'directories.manage_global',
  'directories.manage_branch'
])
where role.organization_id is null and role.code = 'administrator'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = any(array[
  'branches.manage',
  'directories.manage_branch'
])
where role.organization_id is null and role.code = 'manager'
on conflict do nothing;

alter table public.organization_members
  add column primary_branch_id uuid,
  add column has_all_branch_access boolean not null default false;

alter table public.organization_members
  add constraint organization_members_primary_branch_fkey
  foreign key (organization_id, primary_branch_id)
  references public.branches(organization_id, id) on delete restrict;

create index organization_members_primary_branch_idx
  on public.organization_members (primary_branch_id)
  where primary_branch_id is not null;

create table public.member_branch_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_member_id uuid not null,
  branch_id uuid not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (organization_member_id, branch_id),
  constraint member_branch_access_member_fkey
    foreign key (organization_id, organization_member_id)
    references public.organization_members(organization_id, id) on delete cascade,
  constraint member_branch_access_branch_fkey
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete cascade
);

create index member_branch_access_branch_idx
  on public.member_branch_access (organization_id, branch_id);

update public.organization_members member
set
  has_all_branch_access = true,
  primary_branch_id = (
  select branch.id
  from public.branches branch
  where branch.organization_id = member.organization_id
  order by branch.created_at, branch.id
  limit 1
);

create or replace function public.current_user_has_all_branch_access(org_id uuid)
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
      and member.has_all_branch_access
      and organization.status <> 'archived'
  );
$$;

create or replace function public.current_user_has_branch_access(org_id uuid, target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_branch_id is not null and exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    join public.branches branch
      on branch.organization_id = member.organization_id
      and branch.id = target_branch_id
    where member.organization_id = org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and organization.status <> 'archived'
      and (
        member.has_all_branch_access
        or exists (
          select 1
          from public.member_branch_access access
          where access.organization_id = member.organization_id
            and access.organization_member_id = member.id
            and access.branch_id = target_branch_id
        )
      )
  );
$$;

create or replace function public.current_user_can_manage_branch(org_id uuid, target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_user_has_permission(org_id, 'branches.manage')
    and public.current_user_has_branch_access(org_id, target_branch_id);
$$;

revoke all on function public.current_user_has_all_branch_access(uuid) from public;
revoke all on function public.current_user_has_branch_access(uuid, uuid) from public;
revoke all on function public.current_user_can_manage_branch(uuid, uuid) from public;
grant execute on function public.current_user_has_all_branch_access(uuid) to authenticated;
grant execute on function public.current_user_has_branch_access(uuid, uuid) to authenticated;
grant execute on function public.current_user_can_manage_branch(uuid, uuid) to authenticated;

create or replace function public.enforce_member_primary_branch_access()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.primary_branch_id is not null
    and not new.has_all_branch_access
    and not exists (
      select 1
      from public.member_branch_access access
      where access.organization_id = new.organization_id
        and access.organization_member_id = new.id
        and access.branch_id = new.primary_branch_id
    )
  then
    raise exception 'Primary branch must be included in member branch access';
  end if;

  return new;
end;
$$;

create trigger organization_members_primary_branch_guard
before insert or update of primary_branch_id, has_all_branch_access
on public.organization_members
for each row execute function public.enforce_member_primary_branch_access();

alter table public.member_branch_access enable row level security;
grant select on public.member_branch_access to authenticated;

create policy member_branch_access_select on public.member_branch_access
for select to authenticated
using (
  exists (
    select 1
    from public.organization_members member
    where member.id = organization_member_id
      and member.organization_id = member_branch_access.organization_id
      and (
        member.user_id = auth.uid()
        or public.current_user_has_permission(member.organization_id, 'branch_access.manage')
      )
  )
);

create or replace function public.set_member_branch_access(
  org_id uuid,
  target_membership_id uuid,
  allow_all_branches boolean,
  target_primary_branch_id uuid,
  allowed_branch_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_member public.organization_members%rowtype;
  normalized_branch_ids uuid[] := coalesce(allowed_branch_ids, array[]::uuid[]);
  actor_is_owner boolean;
  target_is_owner boolean;
  previous_access jsonb;
begin
  if current_user_id is null
    or not public.current_user_has_permission(org_id, 'branch_access.manage')
    or not public.current_user_has_all_branch_access(org_id)
  then
    raise exception 'All-branch access management permission required' using errcode = '42501';
  end if;

  if allow_all_branches is null then
    raise exception 'Branch access mode is required';
  end if;

  select * into target_member
  from public.organization_members member
  where member.organization_id = org_id
    and member.id = target_membership_id
    and member.status <> 'removed'
  for update;

  if target_member.id is null then
    raise exception 'Organization member not found';
  end if;

  select exists (
    select 1
    from public.organization_members member
    join public.member_roles member_role on member_role.organization_member_id = member.id
    join public.roles role on role.id = member_role.role_id
    where member.organization_id = org_id
      and member.user_id = current_user_id
      and member.status = 'active'
      and role.code = 'owner'
  ) into actor_is_owner;

  select exists (
    select 1
    from public.member_roles member_role
    join public.roles role on role.id = member_role.role_id
    where member_role.organization_member_id = target_membership_id
      and role.code = 'owner'
  ) into target_is_owner;

  if target_is_owner and not actor_is_owner then
    raise exception 'Only an owner can change owner branch access' using errcode = '42501';
  end if;

  if target_primary_branch_id is not null and not exists (
    select 1 from public.branches branch
    where branch.organization_id = org_id and branch.id = target_primary_branch_id
  ) then
    raise exception 'Primary branch not found';
  end if;

  if exists (
    select 1
    from unnest(normalized_branch_ids) as requested(requested_branch_id)
    where not exists (
      select 1 from public.branches branch
      where branch.organization_id = org_id
        and branch.id = requested.requested_branch_id
    )
  ) then
    raise exception 'One or more branches are unavailable';
  end if;

  normalized_branch_ids := array(
    select distinct requested.requested_branch_id
    from unnest(normalized_branch_ids) as requested(requested_branch_id)
    order by requested.requested_branch_id
  );

  if not allow_all_branches
    and target_primary_branch_id is not null
    and not (target_primary_branch_id = any(normalized_branch_ids))
  then
    raise exception 'Primary branch must be included in allowed branches';
  end if;

  previous_access := jsonb_build_object(
    'has_all_branch_access', target_member.has_all_branch_access,
    'primary_branch_id', target_member.primary_branch_id,
    'branch_ids', coalesce((
      select jsonb_agg(access.branch_id order by access.branch_id)
      from public.member_branch_access access
      where access.organization_member_id = target_membership_id
    ), '[]'::jsonb)
  );

  update public.organization_members
  set primary_branch_id = null, has_all_branch_access = true
  where id = target_membership_id;

  delete from public.member_branch_access
  where organization_member_id = target_membership_id;

  if not allow_all_branches then
    insert into public.member_branch_access (
      organization_id, organization_member_id, branch_id, granted_by
    )
    select org_id, target_membership_id, requested.branch_id, current_user_id
    from unnest(normalized_branch_ids) as requested(branch_id);
  end if;

  update public.organization_members
  set
    has_all_branch_access = allow_all_branches,
    primary_branch_id = target_primary_branch_id
  where id = target_membership_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    org_id,
    current_user_id,
    'member.branch_access_changed',
    'organization_member',
    target_membership_id,
    previous_access,
    jsonb_build_object(
      'has_all_branch_access', allow_all_branches,
      'primary_branch_id', target_primary_branch_id,
      'branch_ids', case
        when allow_all_branches then '[]'::jsonb
        else to_jsonb(normalized_branch_ids)
      end
    )
  );
end;
$$;

create or replace function public.list_current_user_branch_access(org_id uuid)
returns table (
  id uuid,
  name text,
  address text,
  timezone text,
  is_active boolean,
  is_primary boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    branch.id,
    branch.name,
    branch.address,
    branch.timezone,
    branch.is_active,
    branch.id = member.primary_branch_id
  from public.organization_members member
  join public.branches branch on branch.organization_id = member.organization_id
  where member.organization_id = org_id
    and member.user_id = auth.uid()
    and member.status = 'active'
    and public.current_user_has_org_access(org_id)
    and (
      member.has_all_branch_access
      or exists (
        select 1
        from public.member_branch_access access
        where access.organization_member_id = member.id
          and access.branch_id = branch.id
      )
    )
  order by (branch.id = member.primary_branch_id) desc, branch.is_active desc, branch.name;
$$;

revoke all on function public.set_member_branch_access(uuid, uuid, boolean, uuid, uuid[]) from public;
revoke all on function public.list_current_user_branch_access(uuid) from public;
grant execute on function public.set_member_branch_access(uuid, uuid, boolean, uuid, uuid[]) to authenticated;
grant execute on function public.list_current_user_branch_access(uuid) to authenticated;

create or replace function public.create_organization_with_owner(
  organization_name text,
  first_branch_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_organization_id uuid;
  new_branch_id uuid;
  new_membership_id uuid;
  owner_role_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(organization_name)) not between 2 and 120 then
    raise exception 'Invalid organization name';
  end if;
  if char_length(trim(first_branch_name)) not between 2 and 120 then
    raise exception 'Invalid branch name';
  end if;

  insert into public.profiles (id, full_name)
  values (current_user_id, '') on conflict (id) do nothing;

  select id into owner_role_id
  from public.roles
  where code = 'owner' and is_system and organization_id is null;

  if owner_role_id is null then
    raise exception 'Owner role is not configured';
  end if;

  insert into public.organizations (name)
  values (trim(organization_name))
  returning id into new_organization_id;

  insert into public.branches (organization_id, name)
  values (new_organization_id, trim(first_branch_name))
  returning id into new_branch_id;

  insert into public.organization_members (
    organization_id, user_id, status, primary_branch_id, has_all_branch_access
  ) values (
    new_organization_id, current_user_id, 'active', new_branch_id, true
  ) returning id into new_membership_id;

  insert into public.member_roles (organization_member_id, role_id, assigned_by)
  values (new_membership_id, owner_role_id, current_user_id);

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    new_organization_id,
    current_user_id,
    'organization.created',
    'organization',
    new_organization_id,
    jsonb_build_object(
      'name', trim(organization_name),
      'primary_branch_id', new_branch_id
    )
  );

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization_with_owner(text, text) from public;
grant execute on function public.create_organization_with_owner(text, text) to authenticated;

commit;
