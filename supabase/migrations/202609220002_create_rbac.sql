create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_role_scope check (
    (is_system and organization_id is null) or
    (not is_system and organization_id is not null)
  )
);

create unique index roles_system_code_idx on public.roles (code) where organization_id is null;
create unique index roles_organization_code_idx on public.roles (organization_id, code) where organization_id is not null;

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.member_roles (
  organization_member_id uuid not null references public.organization_members(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (organization_member_id, role_id)
);

alter table public.organization_invitations
  add constraint organization_invitations_role_id_fkey
  foreign key (role_id) references public.roles(id) on delete restrict;

create trigger roles_set_updated_at before update on public.roles
for each row execute function public.set_updated_at();

create or replace function public.enforce_member_role_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  membership_organization_id uuid;
  role_organization_id uuid;
  role_is_system boolean;
begin
  select organization_id into membership_organization_id
  from public.organization_members where id = new.organization_member_id;

  select organization_id, is_system into role_organization_id, role_is_system
  from public.roles where id = new.role_id;

  if role_is_system is not true and role_organization_id is distinct from membership_organization_id then
    raise exception 'Role belongs to a different organization';
  end if;
  return new;
end;
$$;

create trigger member_roles_scope_guard
before insert or update on public.member_roles
for each row execute function public.enforce_member_role_scope();

insert into public.permissions (code, description) values
  ('patients.read', 'Просмотр пациентов'),
  ('patients.create', 'Создание пациентов'),
  ('patients.update', 'Изменение пациентов'),
  ('patients.delete', 'Архивация пациентов'),
  ('appointments.read', 'Просмотр расписания'),
  ('appointments.manage', 'Управление записями'),
  ('clinical.read', 'Просмотр клинических данных'),
  ('clinical.write', 'Ведение клинических данных'),
  ('treatment_plan.manage', 'Управление планами лечения'),
  ('finance.read', 'Просмотр финансов'),
  ('finance.manage', 'Управление финансами'),
  ('cashdesk.manage', 'Управление кассой'),
  ('inventory.read', 'Просмотр склада'),
  ('inventory.manage', 'Управление складом'),
  ('reports.read', 'Просмотр отчётов'),
  ('settings.manage', 'Управление настройками'),
  ('users.manage', 'Управление пользователями и ролями'),
  ('audit.read', 'Просмотр журнала аудита')
on conflict (code) do update set description = excluded.description;

insert into public.roles (code, name, is_system) values
  ('owner', 'Владелец', true),
  ('administrator', 'Администратор', true),
  ('receptionist', 'Регистратор', true),
  ('doctor', 'Врач', true),
  ('assistant', 'Ассистент', true),
  ('cashier', 'Кассир', true),
  ('accountant', 'Бухгалтер', true),
  ('warehouse_manager', 'Заведующий складом', true),
  ('marketer', 'Маркетолог', true),
  ('manager', 'Управляющий', true),
  ('auditor', 'Аудитор', true)
on conflict (code) where organization_id is null do update set name = excluded.name;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'owner' and r.organization_id is null
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any(array[
  'patients.read','patients.create','patients.update','appointments.read','appointments.manage',
  'clinical.read','finance.read','inventory.read','reports.read','settings.manage','users.manage','audit.read'
]) where r.code = 'administrator' and r.organization_id is null
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any(array[
  'patients.read','patients.create','patients.update','appointments.read','appointments.manage'
]) where r.code = 'receptionist' and r.organization_id is null
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any(array[
  'patients.read','appointments.read','clinical.read','clinical.write','treatment_plan.manage'
]) where r.code = 'doctor' and r.organization_id is null
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any(array[
  'patients.read','appointments.read','clinical.read'
]) where r.code = 'assistant' and r.organization_id is null
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any(array[
  'patients.read','finance.read','finance.manage','cashdesk.manage'
]) where r.code = 'cashier' and r.organization_id is null
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any(array[
  'finance.read','finance.manage','reports.read','audit.read'
]) where r.code = 'accountant' and r.organization_id is null
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any(array[
  'inventory.read','inventory.manage'
]) where r.code = 'warehouse_manager' and r.organization_id is null
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any(array[
  'patients.read','appointments.read','reports.read'
]) where r.code in ('marketer', 'manager') and r.organization_id is null
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any(array[
  'patients.read','appointments.read','clinical.read','finance.read','inventory.read','reports.read','audit.read'
]) where r.code = 'auditor' and r.organization_id is null
on conflict do nothing;

create index roles_organization_id_idx on public.roles (organization_id);
create index member_roles_role_id_idx on public.member_roles (role_id);
grant select on public.permissions, public.roles, public.role_permissions, public.member_roles to authenticated;
grant insert, update, delete on public.roles, public.role_permissions, public.member_roles to authenticated;
