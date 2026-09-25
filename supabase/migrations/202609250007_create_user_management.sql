create or replace function public.list_organization_members_for_management(org_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  full_name text,
  email text,
  status text,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  role_id uuid,
  role_code text,
  role_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'users.manage') then
    raise exception 'Insufficient permissions';
  end if;

  return query
  select
    member.id,
    member.user_id,
    profile.full_name,
    auth_user.email::text,
    member.status,
    member.joined_at,
    auth_user.last_sign_in_at,
    selected_role.id,
    selected_role.code,
    selected_role.name
  from public.organization_members member
  join public.profiles profile on profile.id = member.user_id
  join auth.users auth_user on auth_user.id = member.user_id
  left join lateral (
    select role.id, role.code, role.name
    from public.member_roles member_role
    join public.roles role on role.id = member_role.role_id
    where member_role.organization_member_id = member.id
    order by
      case role.code
        when 'owner' then 1
        when 'administrator' then 2
        else 3
      end,
      member_role.assigned_at
    limit 1
  ) selected_role on true
  where member.organization_id = org_id
    and member.status in ('active', 'suspended')
  order by
    case member.status when 'active' then 1 when 'suspended' then 2 else 3 end,
    lower(profile.full_name),
    lower(auth_user.email);
end;
$$;

create or replace function public.list_organization_invitations_for_management(org_id uuid)
returns table (
  invitation_id uuid,
  email text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  role_id uuid,
  role_code text,
  role_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'users.manage') then
    raise exception 'Insufficient permissions';
  end if;

  return query
  select
    invitation.id,
    invitation.email,
    case
      when invitation.status = 'pending' and invitation.expires_at <= now() then 'expired'
      else invitation.status
    end,
    invitation.expires_at,
    invitation.created_at,
    role.id,
    role.code,
    role.name
  from public.organization_invitations invitation
  join public.roles role on role.id = invitation.role_id
  where invitation.organization_id = org_id
  order by invitation.created_at desc;
end;
$$;

create or replace function public.list_organization_roles_for_management(org_id uuid)
returns table (
  role_id uuid,
  code text,
  name text,
  is_system boolean,
  permission_codes text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'users.manage') then
    raise exception 'Insufficient permissions';
  end if;

  return query
  select
    role.id,
    role.code,
    role.name,
    role.is_system,
    coalesce(array_agg(permission.code order by permission.code) filter (where permission.code is not null), array[]::text[])
  from public.roles role
  left join public.role_permissions role_permission on role_permission.role_id = role.id
  left join public.permissions permission on permission.id = role_permission.permission_id
  where role.is_system or role.organization_id = org_id
  group by role.id
  order by
    case role.code
      when 'owner' then 1
      when 'administrator' then 2
      when 'manager' then 3
      when 'receptionist' then 4
      when 'doctor' then 5
      when 'assistant' then 6
      when 'cashier' then 7
      when 'accountant' then 8
      when 'warehouse_manager' then 9
      when 'marketer' then 10
      when 'auditor' then 11
      else 50
    end,
    role.name;
end;
$$;

create or replace function public.list_user_management_audit(org_id uuid, result_limit integer default 20)
returns table (
  id uuid,
  action text,
  actor_name text,
  actor_email text,
  target_label text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'users.manage')
    or not public.current_user_has_permission(org_id, 'audit.read') then
    raise exception 'Insufficient permissions';
  end if;

  return query
  select
    log.id,
    log.action,
    actor.full_name,
    actor_user.email::text,
    coalesce(log.after_data ->> 'email', log.before_data ->> 'email', log.after_data ->> 'full_name', 'Пользователь'),
    log.occurred_at
  from public.audit_logs log
  left join public.profiles actor on actor.id = log.actor_user_id
  left join auth.users actor_user on actor_user.id = log.actor_user_id
  where log.organization_id = org_id
    and log.action in (
      'invitation.created',
      'invitation.revoked',
      'invitation.accepted',
      'member.role_changed',
      'member.suspended',
      'member.activated',
      'member.removed'
    )
  order by log.occurred_at desc
  limit least(greatest(result_limit, 1), 100);
end;
$$;

create or replace function public.create_organization_invitation(
  org_id uuid,
  invite_email text,
  invite_role_id uuid,
  invite_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(trim(invite_email));
  selected_role public.roles%rowtype;
  new_invitation_id uuid;
begin
  if current_user_id is null or not public.current_user_has_permission(org_id, 'users.manage') then
    raise exception 'Insufficient permissions';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email';
  end if;
  if char_length(invite_token_hash) <> 64 then
    raise exception 'Invalid invitation token';
  end if;

  select * into selected_role
  from public.roles role
  where role.id = invite_role_id
    and (role.is_system or role.organization_id = org_id);
  if selected_role.id is null then
    raise exception 'Role is unavailable';
  end if;
  if selected_role.code = 'owner' and not exists (
    select 1
    from public.organization_members member
    join public.member_roles member_role on member_role.organization_member_id = member.id
    join public.roles role on role.id = member_role.role_id
    where member.organization_id = org_id
      and member.user_id = current_user_id
      and member.status = 'active'
      and role.code = 'owner'
  ) then
    raise exception 'Only an owner can invite another owner';
  end if;
  if exists (
    select 1
    from public.organization_members member
    join auth.users auth_user on auth_user.id = member.user_id
    where member.organization_id = org_id
      and member.status = 'active'
      and lower(auth_user.email) = normalized_email
  ) then
    raise exception 'User is already a member';
  end if;

  update public.organization_invitations
  set status = 'revoked'
  where organization_id = org_id
    and lower(email) = normalized_email
    and status = 'pending';

  insert into public.organization_invitations (
    organization_id, email, role_id, token_hash, invited_by, expires_at
  ) values (
    org_id, normalized_email, invite_role_id, invite_token_hash, current_user_id, now() + interval '7 days'
  ) returning id into new_invitation_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id,
    current_user_id,
    'invitation.created',
    'organization_invitation',
    new_invitation_id,
    jsonb_build_object('email', normalized_email, 'role_code', selected_role.code)
  );

  return new_invitation_id;
end;
$$;

create or replace function public.revoke_organization_invitation(org_id uuid, target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_email text;
begin
  if current_user_id is null or not public.current_user_has_permission(org_id, 'users.manage') then
    raise exception 'Insufficient permissions';
  end if;

  update public.organization_invitations
  set status = 'revoked'
  where id = target_invitation_id
    and organization_id = org_id
    and status = 'pending'
  returning email into invitation_email;

  if invitation_email is null then
    raise exception 'Active invitation not found';
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id,
    current_user_id,
    'invitation.revoked',
    'organization_invitation',
    target_invitation_id,
    jsonb_build_object('email', invitation_email)
  );
end;
$$;

create or replace function public.change_organization_member_role(
  org_id uuid,
  target_membership_id uuid,
  target_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_member public.organization_members%rowtype;
  selected_role public.roles%rowtype;
  previous_role_code text;
  target_email text;
  actor_is_owner boolean;
begin
  if current_user_id is null or not public.current_user_has_permission(org_id, 'users.manage') then
    raise exception 'Insufficient permissions';
  end if;

  select * into target_member
  from public.organization_members member
  where member.id = target_membership_id and member.organization_id = org_id
  for update;
  if target_member.id is null or target_member.status = 'removed' then
    raise exception 'Member not found';
  end if;

  perform 1 from public.organizations organization where organization.id = org_id for update;

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

  select * into selected_role
  from public.roles role
  where role.id = target_role_id
    and (role.is_system or role.organization_id = org_id);
  if selected_role.id is null then
    raise exception 'Role is unavailable';
  end if;

  select role.code into previous_role_code
  from public.member_roles member_role
  join public.roles role on role.id = member_role.role_id
  where member_role.organization_member_id = target_membership_id
  order by case when role.code = 'owner' then 1 else 2 end
  limit 1;

  if selected_role.code = 'owner' and not actor_is_owner then
    raise exception 'Only an owner can assign the owner role';
  end if;

  if previous_role_code = 'owner' and not actor_is_owner then
    raise exception 'Only an owner can change another owner';
  end if;

  if previous_role_code = 'owner' and selected_role.code <> 'owner' and not exists (
    select 1
    from public.organization_members member
    join public.member_roles member_role on member_role.organization_member_id = member.id
    join public.roles role on role.id = member_role.role_id
    where member.organization_id = org_id
      and member.id <> target_membership_id
      and member.status = 'active'
      and role.code = 'owner'
  ) then
    raise exception 'The organization must keep at least one active owner';
  end if;

  delete from public.member_roles where organization_member_id = target_membership_id;
  insert into public.member_roles (organization_member_id, role_id, assigned_by)
  values (target_membership_id, target_role_id, current_user_id);

  select email into target_email from auth.users where id = target_member.user_id;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    org_id,
    current_user_id,
    'member.role_changed',
    'organization_member',
    target_membership_id,
    jsonb_build_object('email', target_email, 'role_code', previous_role_code),
    jsonb_build_object('email', target_email, 'role_code', selected_role.code)
  );
end;
$$;

create or replace function public.change_organization_member_status(
  org_id uuid,
  target_membership_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_member public.organization_members%rowtype;
  target_email text;
  target_is_owner boolean;
  actor_is_owner boolean;
begin
  if current_user_id is null or not public.current_user_has_permission(org_id, 'users.manage') then
    raise exception 'Insufficient permissions';
  end if;
  if target_status not in ('active', 'suspended', 'removed') then
    raise exception 'Invalid member status';
  end if;

  select * into target_member
  from public.organization_members member
  where member.id = target_membership_id and member.organization_id = org_id
  for update;
  if target_member.id is null or target_member.status = 'removed' then
    raise exception 'Member not found';
  end if;
  if target_member.user_id = current_user_id and target_status <> 'active' then
    raise exception 'You cannot block or remove your own account';
  end if;

  perform 1 from public.organizations organization where organization.id = org_id for update;

  select exists (
    select 1
    from public.member_roles member_role
    join public.roles role on role.id = member_role.role_id
    where member_role.organization_member_id = target_membership_id
      and role.code = 'owner'
  ) into target_is_owner;

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

  if target_is_owner and not actor_is_owner then
    raise exception 'Only an owner can block or remove another owner';
  end if;

  if target_is_owner and target_status <> 'active' and not exists (
    select 1
    from public.organization_members member
    join public.member_roles member_role on member_role.organization_member_id = member.id
    join public.roles role on role.id = member_role.role_id
    where member.organization_id = org_id
      and member.id <> target_membership_id
      and member.status = 'active'
      and role.code = 'owner'
  ) then
    raise exception 'The organization must keep at least one active owner';
  end if;

  update public.organization_members
  set status = target_status
  where id = target_membership_id;

  select email into target_email from auth.users where id = target_member.user_id;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    org_id,
    current_user_id,
    case target_status
      when 'active' then 'member.activated'
      when 'suspended' then 'member.suspended'
      else 'member.removed'
    end,
    'organization_member',
    target_membership_id,
    jsonb_build_object('email', target_email, 'status', target_member.status),
    jsonb_build_object('email', target_email, 'status', target_status)
  );
end;
$$;

create or replace function public.inspect_organization_invitation(invite_token_hash text)
returns table (
  organization_id uuid,
  organization_name text,
  email text,
  role_name text,
  status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    invitation.organization_id,
    organization.name,
    invitation.email,
    role.name,
    case
      when invitation.status = 'pending' and invitation.expires_at <= now() then 'expired'
      else invitation.status
    end,
    invitation.expires_at
  from public.organization_invitations invitation
  join public.organizations organization on organization.id = invitation.organization_id
  join public.roles role on role.id = invitation.role_id
  where invitation.token_hash = invite_token_hash
  limit 1;
$$;

create or replace function public.accept_organization_invitation(invite_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invitation public.organization_invitations%rowtype;
  membership_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into invitation
  from public.organization_invitations current_invitation
  where current_invitation.token_hash = invite_token_hash
  for update;

  if invitation.id is null or invitation.status <> 'pending' then
    raise exception 'Invitation is unavailable';
  end if;
  if invitation.expires_at <= now() then
    update public.organization_invitations set status = 'expired' where id = invitation.id;
    raise exception 'Invitation has expired';
  end if;
  if lower(invitation.email) <> current_email then
    raise exception 'Invitation belongs to another email address';
  end if;

  insert into public.profiles (id, full_name)
  values (current_user_id, '')
  on conflict (id) do nothing;

  insert into public.organization_members (organization_id, user_id, status)
  values (invitation.organization_id, current_user_id, 'active')
  on conflict (organization_id, user_id)
  do update set status = 'active', joined_at = now()
  returning id into membership_id;

  delete from public.member_roles where organization_member_id = membership_id;
  insert into public.member_roles (organization_member_id, role_id, assigned_by)
  values (membership_id, invitation.role_id, invitation.invited_by);

  update public.organization_invitations
  set status = 'accepted', accepted_at = now()
  where id = invitation.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    invitation.organization_id,
    current_user_id,
    'invitation.accepted',
    'organization_member',
    membership_id,
    jsonb_build_object('email', invitation.email, 'invitation_id', invitation.id)
  );

  return invitation.organization_id;
end;
$$;

revoke all on function public.list_organization_members_for_management(uuid) from public;
revoke all on function public.list_organization_invitations_for_management(uuid) from public;
revoke all on function public.list_organization_roles_for_management(uuid) from public;
revoke all on function public.list_user_management_audit(uuid, integer) from public;
revoke all on function public.create_organization_invitation(uuid, text, uuid, text) from public;
revoke all on function public.revoke_organization_invitation(uuid, uuid) from public;
revoke all on function public.change_organization_member_role(uuid, uuid, uuid) from public;
revoke all on function public.change_organization_member_status(uuid, uuid, text) from public;
revoke all on function public.inspect_organization_invitation(text) from public;
revoke all on function public.accept_organization_invitation(text) from public;

grant execute on function public.list_organization_members_for_management(uuid) to authenticated;
grant execute on function public.list_organization_invitations_for_management(uuid) to authenticated;
grant execute on function public.list_organization_roles_for_management(uuid) to authenticated;
grant execute on function public.list_user_management_audit(uuid, integer) to authenticated;
grant execute on function public.create_organization_invitation(uuid, text, uuid, text) to authenticated;
grant execute on function public.revoke_organization_invitation(uuid, uuid) to authenticated;
grant execute on function public.change_organization_member_role(uuid, uuid, uuid) to authenticated;
grant execute on function public.change_organization_member_status(uuid, uuid, text) to authenticated;
grant execute on function public.inspect_organization_invitation(text) to anon, authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;
