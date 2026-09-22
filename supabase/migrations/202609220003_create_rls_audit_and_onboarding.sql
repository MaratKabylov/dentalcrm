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
      and organization.status = 'active'
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
      and organization.status = 'active'
      and permission.code = permission_code
      and (role.is_system or role.organization_id = org_id)
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
      and organization.status = 'active'
  );
$$;

revoke all on function public.current_user_has_org_access(uuid) from public;
revoke all on function public.current_user_has_permission(uuid, text) from public;
revoke all on function public.current_user_shares_organization(uuid) from public;
grant execute on function public.current_user_has_org_access(uuid) to authenticated;
grant execute on function public.current_user_has_permission(uuid, text) to authenticated;
grant execute on function public.current_user_shares_organization(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_roles enable row level security;

create policy organizations_select on public.organizations
for select to authenticated
using (public.current_user_has_org_access(id));

create policy organizations_update on public.organizations
for update to authenticated
using (public.current_user_has_permission(id, 'settings.manage'))
with check (public.current_user_has_permission(id, 'settings.manage'));

create policy profiles_select on public.profiles
for select to authenticated
using (id = auth.uid() or public.current_user_shares_organization(id));

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy branches_select on public.branches
for select to authenticated
using (public.current_user_has_org_access(organization_id));

create policy branches_insert on public.branches
for insert to authenticated
with check (public.current_user_has_permission(organization_id, 'settings.manage'));

create policy branches_update on public.branches
for update to authenticated
using (public.current_user_has_permission(organization_id, 'settings.manage'))
with check (public.current_user_has_permission(organization_id, 'settings.manage'));

create policy branches_delete on public.branches
for delete to authenticated
using (public.current_user_has_permission(organization_id, 'settings.manage'));

create policy organization_members_select on public.organization_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.current_user_has_permission(organization_id, 'users.manage')
);

create policy organization_members_insert on public.organization_members
for insert to authenticated
with check (public.current_user_has_permission(organization_id, 'users.manage'));

create policy organization_members_update on public.organization_members
for update to authenticated
using (public.current_user_has_permission(organization_id, 'users.manage'))
with check (public.current_user_has_permission(organization_id, 'users.manage'));

create policy organization_members_delete on public.organization_members
for delete to authenticated
using (public.current_user_has_permission(organization_id, 'users.manage'));

create policy invitations_select on public.organization_invitations
for select to authenticated
using (public.current_user_has_permission(organization_id, 'users.manage'));

create policy invitations_insert on public.organization_invitations
for insert to authenticated
with check (
  invited_by = auth.uid()
  and public.current_user_has_permission(organization_id, 'users.manage')
);

create policy invitations_update on public.organization_invitations
for update to authenticated
using (public.current_user_has_permission(organization_id, 'users.manage'))
with check (public.current_user_has_permission(organization_id, 'users.manage'));

create policy permissions_select on public.permissions
for select to authenticated using (true);

create policy roles_select on public.roles
for select to authenticated
using (is_system or public.current_user_has_org_access(organization_id));

create policy roles_insert on public.roles
for insert to authenticated
with check (
  not is_system
  and organization_id is not null
  and public.current_user_has_permission(organization_id, 'users.manage')
);

create policy roles_update on public.roles
for update to authenticated
using (
  not is_system
  and public.current_user_has_permission(organization_id, 'users.manage')
)
with check (
  not is_system
  and public.current_user_has_permission(organization_id, 'users.manage')
);

create policy roles_delete on public.roles
for delete to authenticated
using (
  not is_system
  and public.current_user_has_permission(organization_id, 'users.manage')
);

create policy role_permissions_select on public.role_permissions
for select to authenticated
using (
  exists (
    select 1 from public.roles role
    where role.id = role_id
      and (role.is_system or public.current_user_has_org_access(role.organization_id))
  )
);

create policy role_permissions_insert on public.role_permissions
for insert to authenticated
with check (
  exists (
    select 1 from public.roles role
    where role.id = role_id
      and not role.is_system
      and public.current_user_has_permission(role.organization_id, 'users.manage')
  )
);

create policy role_permissions_delete on public.role_permissions
for delete to authenticated
using (
  exists (
    select 1 from public.roles role
    where role.id = role_id
      and not role.is_system
      and public.current_user_has_permission(role.organization_id, 'users.manage')
  )
);

create policy member_roles_select on public.member_roles
for select to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.id = organization_member_id
      and (
        member.user_id = auth.uid()
        or public.current_user_has_permission(member.organization_id, 'users.manage')
      )
  )
);

create policy member_roles_insert on public.member_roles
for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members member
    where member.id = organization_member_id
      and public.current_user_has_permission(member.organization_id, 'users.manage')
  )
);

create policy member_roles_delete on public.member_roles
for delete to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.id = organization_member_id
      and public.current_user_has_permission(member.organization_id, 'users.manage')
  )
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_logs_organization_time_idx
  on public.audit_logs (organization_id, occurred_at desc);
create index audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id) where entity_id is not null;

alter table public.audit_logs enable row level security;
grant select on public.audit_logs to authenticated;

create policy audit_logs_select on public.audit_logs
for select to authenticated
using (public.current_user_has_permission(organization_id, 'audit.read'));

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

  select id into owner_role_id from public.roles
  where code = 'owner' and is_system and organization_id is null;
  if owner_role_id is null then
    raise exception 'Owner role is not configured';
  end if;

  insert into public.organizations (name)
  values (trim(organization_name)) returning id into new_organization_id;

  insert into public.branches (organization_id, name)
  values (new_organization_id, trim(first_branch_name));

  insert into public.organization_members (organization_id, user_id, status)
  values (new_organization_id, current_user_id, 'active')
  returning id into new_membership_id;

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
    jsonb_build_object('name', trim(organization_name))
  );

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization_with_owner(text, text) from public;
grant execute on function public.create_organization_with_owner(text, text) to authenticated;
