-- Authorization catalog is also installed by migrations because production
-- security must never depend on development seeds. This file keeps local
-- `supabase db reset` idempotent and documents the required baseline.
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
  ('crm.read', 'Просмотр CRM'),
  ('crm.manage', 'Управление лидами и источниками'),
  ('tasks.read', 'Просмотр задач'),
  ('tasks.manage', 'Управление задачами'),
  ('recalls.read', 'Просмотр повторных визитов'),
  ('recalls.manage', 'Управление повторными визитами'),
  ('inventory.read', 'Просмотр склада'),
  ('inventory.manage', 'Управление складом'),
  ('reports.read', 'Просмотр отчётов'),
  ('settings.manage', 'Управление настройками'),
  ('users.manage', 'Управление пользователями и ролями'),
  ('audit.read', 'Просмотр журнала аудита')
on conflict (code) do update set description = excluded.description;

insert into public.roles (code, name, is_system) values
  ('owner', 'Владелец', true), ('administrator', 'Администратор', true),
  ('receptionist', 'Регистратор', true), ('doctor', 'Врач', true),
  ('assistant', 'Ассистент', true), ('cashier', 'Кассир', true),
  ('accountant', 'Бухгалтер', true), ('warehouse_manager', 'Заведующий складом', true),
  ('marketer', 'Маркетолог', true), ('manager', 'Управляющий', true),
  ('auditor', 'Аудитор', true)
on conflict (code) where organization_id is null do update set name = excluded.name;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role cross join public.permissions permission
where role.code = 'owner' and role.organization_id is null
on conflict do nothing;
