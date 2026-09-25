begin;

insert into public.permissions (code, description) values
  ('payroll.read', 'Просмотр начислений сотрудникам'),
  ('payroll.manage', 'Настройка ставок и проведение начислений')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = any(array['payroll.read', 'payroll.manage'])
where role.organization_id is null and role.code = any(array['owner', 'administrator', 'accountant'])
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = 'payroll.read'
where role.organization_id is null and role.code = 'auditor'
on conflict do nothing;

create table public.compensation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid,
  service_id uuid,
  service_category_id uuid,
  rule_type text not null check (rule_type in ('percent_revenue', 'fixed_per_service', 'percent_margin')),
  value numeric(14,4) not null check (value >= 0),
  valid_from date not null,
  valid_to date,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compensation_rules_employee_fkey foreign key (organization_id, employee_id)
    references public.employees(organization_id, id) on delete restrict,
  constraint compensation_rules_service_fkey foreign key (organization_id, service_id)
    references public.services(organization_id, id) on delete restrict,
  constraint compensation_rules_category_fkey foreign key (organization_id, service_category_id)
    references public.service_categories(organization_id, id) on delete restrict,
  constraint compensation_rules_scope_check check (not (service_id is not null and service_category_id is not null)),
  constraint compensation_rules_dates_check check (valid_to is null or valid_to >= valid_from),
  constraint compensation_rules_type_value_check check (
    (rule_type in ('percent_revenue', 'percent_margin') and value <= 100)
    or rule_type = 'fixed_per_service'
  ),
  unique (organization_id, id)
);

create table public.compensation_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  doctor_id uuid not null,
  performed_service_id uuid not null,
  invoice_item_id uuid not null,
  compensation_rule_id uuid not null,
  rule_type_snapshot text not null check (rule_type_snapshot in ('percent_revenue', 'fixed_per_service', 'percent_margin')),
  rule_value_snapshot numeric(14,4) not null check (rule_value_snapshot >= 0),
  service_code_snapshot text not null,
  service_name_snapshot text not null,
  quantity numeric(10,2) not null check (quantity > 0),
  revenue_amount numeric(14,2) not null check (revenue_amount >= 0),
  material_cost_amount numeric(14,2) not null check (material_cost_amount >= 0),
  calculation_base numeric(14,2) not null check (calculation_base >= 0),
  compensation_amount numeric(14,2) not null check (compensation_amount >= 0),
  performed_at timestamptz not null,
  posted_by uuid not null references public.profiles(id) on delete restrict,
  posted_at timestamptz not null default now(),
  constraint compensation_entries_employee_fkey foreign key (organization_id, employee_id)
    references public.employees(organization_id, id) on delete restrict,
  constraint compensation_entries_doctor_fkey foreign key (organization_id, doctor_id)
    references public.doctors(organization_id, id) on delete restrict,
  constraint compensation_entries_performed_fkey foreign key (organization_id, performed_service_id)
    references public.performed_services(organization_id, id) on delete restrict,
  constraint compensation_entries_invoice_item_fkey foreign key (organization_id, invoice_item_id)
    references public.invoice_items(organization_id, id) on delete restrict,
  constraint compensation_entries_rule_fkey foreign key (organization_id, compensation_rule_id)
    references public.compensation_rules(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, performed_service_id)
);

create index compensation_rules_lookup_idx on public.compensation_rules
  (organization_id, employee_id, service_id, service_category_id, valid_from, valid_to, is_active);
create index compensation_entries_period_idx on public.compensation_entries (organization_id, performed_at desc);
create index compensation_entries_employee_idx on public.compensation_entries (organization_id, employee_id, performed_at desc);

create trigger compensation_rules_set_updated_at before update on public.compensation_rules
for each row execute function public.set_updated_at();

alter table public.compensation_rules enable row level security;
alter table public.compensation_entries enable row level security;

create policy compensation_rules_select on public.compensation_rules for select to authenticated
using (public.current_user_has_permission(organization_id, 'payroll.read'));
create policy compensation_entries_select on public.compensation_entries for select to authenticated
using (public.current_user_has_permission(organization_id, 'payroll.read'));
grant select on public.compensation_rules, public.compensation_entries to authenticated;

create or replace function public.save_compensation_rule(
  org_id uuid, target_employee_id uuid, target_service_id uuid, target_category_id uuid,
  target_rule_type text, target_value numeric, target_valid_from date, target_valid_to date
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare new_rule_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'payroll.manage') then raise exception 'Payroll manage permission required' using errcode = '42501'; end if;
  if target_rule_type not in ('percent_revenue', 'fixed_per_service', 'percent_margin')
    or target_value is null or target_value < 0
    or (target_rule_type in ('percent_revenue', 'percent_margin') and target_value > 100)
    or target_valid_from is null or (target_valid_to is not null and target_valid_to < target_valid_from)
  then raise exception 'Compensation rule is invalid'; end if;
  if target_service_id is not null and target_category_id is not null then raise exception 'Choose service or category, not both'; end if;
  if target_employee_id is not null and not exists (select 1 from public.employees where organization_id = org_id and id = target_employee_id and employee_type = 'doctor') then raise exception 'Doctor employee not found'; end if;
  if target_service_id is not null and not exists (select 1 from public.services where organization_id = org_id and id = target_service_id) then raise exception 'Service not found'; end if;
  if target_category_id is not null and not exists (select 1 from public.service_categories where organization_id = org_id and id = target_category_id) then raise exception 'Service category not found'; end if;
  if exists (
    select 1 from public.compensation_rules rule
    where rule.organization_id = org_id
      and rule.employee_id is not distinct from target_employee_id
      and rule.service_id is not distinct from target_service_id
      and rule.service_category_id is not distinct from target_category_id
      and daterange(rule.valid_from, coalesce(rule.valid_to + 1, 'infinity'::date), '[)')
        && daterange(target_valid_from, coalesce(target_valid_to + 1, 'infinity'::date), '[)')
  ) then raise exception 'Overlapping compensation rule exists'; end if;
  insert into public.compensation_rules (organization_id, employee_id, service_id, service_category_id,
    rule_type, value, valid_from, valid_to, created_by)
  values (org_id, target_employee_id, target_service_id, target_category_id, target_rule_type, target_value,
    target_valid_from, target_valid_to, auth.uid()) returning id into new_rule_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'compensation_rule.created', 'compensation_rule', new_rule_id,
    jsonb_build_object('employee_id', target_employee_id, 'service_id', target_service_id,
      'category_id', target_category_id, 'rule_type', target_rule_type, 'value', target_value,
      'valid_from', target_valid_from, 'valid_to', target_valid_to));
  return new_rule_id;
end;
$$;

create or replace function public.close_compensation_rule(org_id uuid, target_rule_id uuid, closing_date date)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare rule_start date;
begin
  if not public.current_user_has_permission(org_id, 'payroll.manage') then raise exception 'Payroll manage permission required' using errcode = '42501'; end if;
  select valid_from into rule_start from public.compensation_rules
  where organization_id = org_id and id = target_rule_id and is_active for update;
  if rule_start is null then raise exception 'Active compensation rule not found'; end if;
  if closing_date is null or closing_date < rule_start then raise exception 'Closing date is invalid'; end if;
  update public.compensation_rules set valid_to = closing_date, is_active = false
  where organization_id = org_id and id = target_rule_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'compensation_rule.closed', 'compensation_rule', target_rule_id,
    jsonb_build_object('valid_to', closing_date));
end;
$$;

create or replace function public.post_compensation_entries(org_id uuid, report_start date, report_end date)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare organization_timezone text; start_at timestamptz; end_at timestamptz; inserted_count integer;
begin
  if not public.current_user_has_permission(org_id, 'payroll.manage') then raise exception 'Payroll manage permission required' using errcode = '42501'; end if;
  if report_start is null or report_end is null or report_end < report_start or report_end - report_start > 366 then raise exception 'Payroll period is invalid'; end if;
  select timezone into organization_timezone from public.organizations where id = org_id;
  start_at := report_start::timestamp at time zone organization_timezone;
  end_at := (report_end + 1)::timestamp at time zone organization_timezone;

  insert into public.compensation_entries (
    organization_id, employee_id, doctor_id, performed_service_id, invoice_item_id, compensation_rule_id,
    rule_type_snapshot, rule_value_snapshot, service_code_snapshot, service_name_snapshot, quantity,
    revenue_amount, material_cost_amount, calculation_base, compensation_amount, performed_at, posted_by
  )
  select org_id, doctor.employee_id, performed.doctor_id, performed.id, invoice_item.id, rule.id,
    rule.rule_type, rule.value, performed.service_code_snapshot, performed.service_name_snapshot, performed.quantity,
    invoice_item.amount, costs.material_cost,
    case rule.rule_type when 'percent_margin' then greatest(invoice_item.amount - costs.material_cost, 0) else invoice_item.amount end,
    round(case rule.rule_type
      when 'percent_revenue' then invoice_item.amount * rule.value / 100
      when 'percent_margin' then greatest(invoice_item.amount - costs.material_cost, 0) * rule.value / 100
      else performed.quantity * rule.value end, 2),
    performed.performed_at, auth.uid()
  from public.performed_services performed
  join public.doctors doctor on doctor.organization_id = performed.organization_id and doctor.id = performed.doctor_id
  join public.services service on service.organization_id = performed.organization_id and service.id = performed.service_id
  join public.invoice_items invoice_item on invoice_item.organization_id = performed.organization_id and invoice_item.performed_service_id = performed.id
  join public.invoices invoice on invoice.organization_id = invoice_item.organization_id and invoice.id = invoice_item.invoice_id
  left join lateral (
    select coalesce(sum(-movement.quantity * coalesce(movement.unit_cost, 0)), 0)::numeric as material_cost
    from public.stock_movements movement
    where movement.organization_id = performed.organization_id and movement.movement_type = 'procedure_usage'
      and movement.source_id = performed.id
  ) costs on true
  join lateral (
    select candidate.* from public.compensation_rules candidate
    where candidate.organization_id = performed.organization_id
      and (candidate.employee_id is null or candidate.employee_id = doctor.employee_id)
      and (candidate.service_id is null or candidate.service_id = performed.service_id)
      and (candidate.service_category_id is null or candidate.service_category_id = service.category_id)
      and (performed.performed_at at time zone organization_timezone)::date >= candidate.valid_from
      and (candidate.valid_to is null or (performed.performed_at at time zone organization_timezone)::date <= candidate.valid_to)
    order by
      (candidate.employee_id is not null)::integer desc,
      (candidate.service_id is not null)::integer desc,
      (candidate.service_category_id is not null)::integer desc,
      candidate.created_at desc
    limit 1
  ) rule on true
  where performed.organization_id = org_id and performed.voided_at is null
    and performed.performed_at >= start_at and performed.performed_at < end_at
    and invoice.status in ('issued', 'partially_paid', 'paid')
  on conflict (organization_id, performed_service_id) do nothing;
  get diagnostics inserted_count = row_count;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, after_data)
  values (org_id, auth.uid(), 'compensation_entries.posted', 'compensation_period',
    jsonb_build_object('from', report_start, 'to', report_end, 'entries_created', inserted_count));
  return inserted_count;
end;
$$;

create or replace function public.list_compensation_reference_data(org_id uuid)
returns table (entity_type text, id uuid, parent_id uuid, code text, name text, is_active boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'doctor'::text as entity_type, employee.id as id, doctor.id as parent_id,
    null::text as code, employee.full_name as name, employee.is_active and doctor.is_active as is_active
  from public.doctors doctor join public.employees employee on employee.organization_id = doctor.organization_id and employee.id = doctor.employee_id
  where doctor.organization_id = org_id and public.current_user_has_permission(org_id, 'payroll.read')
  union all
  select 'service', service.id, service.category_id, service.code, service.name, service.is_active
  from public.services service where service.organization_id = org_id and public.current_user_has_permission(org_id, 'payroll.read')
  union all
  select 'category', category.id, category.parent_id, null, category.name, category.is_active
  from public.service_categories category where category.organization_id = org_id and public.current_user_has_permission(org_id, 'payroll.read')
  order by 1, 5;
$$;

create or replace function public.list_compensation_rules(org_id uuid)
returns table (id uuid, employee_id uuid, employee_name text, service_id uuid, service_name text,
  category_id uuid, category_name text, rule_type text, value numeric, valid_from date, valid_to date, is_active boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select rule.id, rule.employee_id, employee.full_name, rule.service_id, service.name,
    rule.service_category_id, category.name, rule.rule_type, rule.value, rule.valid_from, rule.valid_to, rule.is_active
  from public.compensation_rules rule
  left join public.employees employee on employee.organization_id = rule.organization_id and employee.id = rule.employee_id
  left join public.services service on service.organization_id = rule.organization_id and service.id = rule.service_id
  left join public.service_categories category on category.organization_id = rule.organization_id and category.id = rule.service_category_id
  where rule.organization_id = org_id and public.current_user_has_permission(org_id, 'payroll.read')
  order by rule.is_active desc, rule.valid_from desc, rule.created_at desc;
$$;

create or replace function public.get_compensation_report(org_id uuid, report_start date, report_end date)
returns table (employee_id uuid, employee_name text, entries_count bigint, revenue_amount numeric,
  material_cost_amount numeric, compensation_amount numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare organization_timezone text; start_at timestamptz; end_at timestamptz;
begin
  if not public.current_user_has_permission(org_id, 'payroll.read') then raise exception 'Payroll read permission required' using errcode = '42501'; end if;
  if report_start is null or report_end is null or report_end < report_start or report_end - report_start > 366 then raise exception 'Payroll period is invalid'; end if;
  select timezone into organization_timezone from public.organizations where id = org_id;
  start_at := report_start::timestamp at time zone organization_timezone;
  end_at := (report_end + 1)::timestamp at time zone organization_timezone;
  return query select entry.employee_id, employee.full_name, count(*)::bigint,
    coalesce(sum(entry.revenue_amount), 0), coalesce(sum(entry.material_cost_amount), 0), coalesce(sum(entry.compensation_amount), 0)
  from public.compensation_entries entry join public.employees employee on employee.organization_id = entry.organization_id and employee.id = entry.employee_id
  where entry.organization_id = org_id and entry.performed_at >= start_at and entry.performed_at < end_at
  group by entry.employee_id, employee.full_name order by sum(entry.compensation_amount) desc;
end;
$$;

create or replace function public.list_compensation_entries(org_id uuid, report_start date, report_end date)
returns table (id uuid, employee_name text, service_name text, quantity numeric, rule_type text, rule_value numeric,
  revenue_amount numeric, material_cost_amount numeric, calculation_base numeric, compensation_amount numeric,
  performed_at timestamptz, posted_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare organization_timezone text; start_at timestamptz; end_at timestamptz;
begin
  if not public.current_user_has_permission(org_id, 'payroll.read') then raise exception 'Payroll read permission required' using errcode = '42501'; end if;
  if report_start is null or report_end is null or report_end < report_start or report_end - report_start > 366 then raise exception 'Payroll period is invalid'; end if;
  select timezone into organization_timezone from public.organizations where organizations.id = org_id;
  start_at := report_start::timestamp at time zone organization_timezone;
  end_at := (report_end + 1)::timestamp at time zone organization_timezone;
  return query select entry.id, employee.full_name, entry.service_name_snapshot, entry.quantity,
    entry.rule_type_snapshot, entry.rule_value_snapshot, entry.revenue_amount, entry.material_cost_amount,
    entry.calculation_base, entry.compensation_amount, entry.performed_at, entry.posted_at
  from public.compensation_entries entry
  join public.employees employee on employee.organization_id = entry.organization_id and employee.id = entry.employee_id
  where entry.organization_id = org_id and entry.performed_at >= start_at and entry.performed_at < end_at
  order by entry.performed_at desc, entry.id;
end;
$$;

create or replace function public.get_executive_analytics(
  org_id uuid, report_start date, report_end date, branch_filter uuid default null, doctor_filter uuid default null
) returns table (
  revenue_amount numeric, payments_amount numeric, debt_amount numeric, appointments_count bigint,
  completed_count bigint, cancelled_count bigint, no_show_count bigint, new_patients_count bigint,
  returning_patients_count bigint, average_bill numeric, treatment_plans_count bigint,
  accepted_plans_count bigint, unfinished_plans_count bigint, doctor_production numeric, material_cost numeric
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare organization_timezone text; start_at timestamptz; end_at timestamptz;
begin
  if not public.current_user_has_permission(org_id, 'reports.read') then raise exception 'Reports read permission required' using errcode = '42501'; end if;
  if report_start is null or report_end is null or report_end < report_start or report_end - report_start > 366 then raise exception 'Report period is invalid'; end if;
  select timezone into organization_timezone from public.organizations where id = org_id;
  start_at := report_start::timestamp at time zone organization_timezone;
  end_at := (report_end + 1)::timestamp at time zone organization_timezone;
  return query
  with appointment_metrics as (
    select count(*)::bigint total,
      count(*) filter (where status.code = 'completed')::bigint completed,
      count(*) filter (where status.code = 'cancelled')::bigint cancelled,
      count(*) filter (where status.code = 'no_show')::bigint no_show
    from public.appointments appointment join public.appointment_statuses status on status.id = appointment.status_id and status.organization_id = appointment.organization_id
    where appointment.organization_id = org_id and appointment.start_at >= start_at and appointment.start_at < end_at
      and (branch_filter is null or appointment.branch_id = branch_filter) and (doctor_filter is null or appointment.doctor_id = doctor_filter)
  ), invoice_metrics as (
    select coalesce(sum(invoice.total_amount), 0)::numeric revenue, coalesce(sum(invoice.debt_amount), 0)::numeric debt,
      coalesce(avg(invoice.total_amount), 0)::numeric average_bill
    from public.invoices invoice left join public.clinical_encounters encounter on encounter.organization_id = invoice.organization_id and encounter.id = invoice.encounter_id
    where invoice.organization_id = org_id and invoice.issued_at >= start_at and invoice.issued_at < end_at
      and (branch_filter is null or invoice.branch_id = branch_filter) and (doctor_filter is null or encounter.doctor_id = doctor_filter)
  ), payment_metrics as (
    select coalesce(sum(payment.amount - payment.refunded_amount), 0)::numeric payments
    from public.payments payment left join public.invoices invoice on invoice.organization_id = payment.organization_id and invoice.id = payment.invoice_id
    left join public.clinical_encounters encounter on encounter.organization_id = invoice.organization_id and encounter.id = invoice.encounter_id
    where payment.organization_id = org_id and payment.status <> 'reversed' and payment.paid_at >= start_at and payment.paid_at < end_at
      and (branch_filter is null or payment.branch_id = branch_filter) and (doctor_filter is null or encounter.doctor_id = doctor_filter)
  ), patient_metrics as (
    select
      count(*) filter (where patient.created_at >= start_at and patient.created_at < end_at and (branch_filter is null or patient.primary_branch_id = branch_filter))::bigint new_patients,
      (select count(distinct current_appointment.patient_id)::bigint from public.appointments current_appointment
        where current_appointment.organization_id = org_id and current_appointment.start_at >= start_at and current_appointment.start_at < end_at
          and (branch_filter is null or current_appointment.branch_id = branch_filter) and (doctor_filter is null or current_appointment.doctor_id = doctor_filter)
          and exists (select 1 from public.appointments previous join public.appointment_statuses previous_status on previous_status.id = previous.status_id
            where previous.organization_id = org_id and previous.patient_id = current_appointment.patient_id
              and previous.start_at < start_at and previous_status.code = 'completed')) returning_patients
    from public.patients patient where patient.organization_id = org_id
  ), plan_metrics as (
    select count(*) filter (where plan.created_at >= start_at and plan.created_at < end_at)::bigint plans,
      count(*) filter (where plan.accepted_at >= start_at and plan.accepted_at < end_at)::bigint accepted,
      count(*) filter (where plan.status in ('proposed', 'approved', 'in_progress'))::bigint unfinished
    from public.treatment_plans plan where plan.organization_id = org_id
      and (doctor_filter is null or plan.doctor_id = doctor_filter)
  ), production_metrics as (
    select coalesce(sum(performed.final_amount), 0)::numeric production
    from public.performed_services performed join public.clinical_encounters encounter on encounter.organization_id = performed.organization_id and encounter.id = performed.encounter_id
    where performed.organization_id = org_id and performed.voided_at is null and performed.performed_at >= start_at and performed.performed_at < end_at
      and (branch_filter is null or encounter.branch_id = branch_filter) and (doctor_filter is null or performed.doctor_id = doctor_filter)
  ), material_metrics as (
    select coalesce(sum(-movement.quantity * coalesce(movement.unit_cost, 0)), 0)::numeric cost
    from public.stock_movements movement join public.warehouses warehouse on warehouse.organization_id = movement.organization_id and warehouse.id = movement.warehouse_id
    left join public.performed_services performed on movement.source_type = 'performed_service' and performed.organization_id = movement.organization_id and performed.id = movement.source_id
    where movement.organization_id = org_id and movement.movement_type in ('procedure_usage', 'write_off')
      and movement.created_at >= start_at and movement.created_at < end_at
      and (branch_filter is null or warehouse.branch_id = branch_filter) and (doctor_filter is null or performed.doctor_id = doctor_filter)
  )
  select invoice_metrics.revenue, payment_metrics.payments, invoice_metrics.debt,
    appointment_metrics.total, appointment_metrics.completed, appointment_metrics.cancelled, appointment_metrics.no_show,
    patient_metrics.new_patients, patient_metrics.returning_patients, invoice_metrics.average_bill,
    plan_metrics.plans, plan_metrics.accepted, plan_metrics.unfinished, production_metrics.production, material_metrics.cost
  from appointment_metrics, invoice_metrics, payment_metrics, patient_metrics, plan_metrics, production_metrics, material_metrics;
end;
$$;

create or replace function public.get_daily_analytics_series(
  org_id uuid, report_start date, report_end date, branch_filter uuid default null, doctor_filter uuid default null
) returns table (metric_date date, revenue_amount numeric, payments_amount numeric, production_amount numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare organization_timezone text;
begin
  if not public.current_user_has_permission(org_id, 'reports.read') then raise exception 'Reports read permission required' using errcode = '42501'; end if;
  if report_start is null or report_end is null or report_end < report_start or report_end - report_start > 366 then raise exception 'Report period is invalid'; end if;
  select timezone into organization_timezone from public.organizations where id = org_id;
  return query
  with days as (select day::date metric_date from generate_series(report_start, report_end, interval '1 day') day),
  invoices_by_day as (
    select (invoice.issued_at at time zone organization_timezone)::date metric_date, sum(invoice.total_amount)::numeric amount
    from public.invoices invoice left join public.clinical_encounters encounter on encounter.organization_id = invoice.organization_id and encounter.id = invoice.encounter_id
    where invoice.organization_id = org_id and (invoice.issued_at at time zone organization_timezone)::date between report_start and report_end
      and (branch_filter is null or invoice.branch_id = branch_filter) and (doctor_filter is null or encounter.doctor_id = doctor_filter)
    group by 1
  ), payments_by_day as (
    select (payment.paid_at at time zone organization_timezone)::date metric_date, sum(payment.amount - payment.refunded_amount)::numeric amount
    from public.payments payment left join public.invoices invoice on invoice.organization_id = payment.organization_id and invoice.id = payment.invoice_id
    left join public.clinical_encounters encounter on encounter.organization_id = invoice.organization_id and encounter.id = invoice.encounter_id
    where payment.organization_id = org_id and payment.status <> 'reversed' and (payment.paid_at at time zone organization_timezone)::date between report_start and report_end
      and (branch_filter is null or payment.branch_id = branch_filter) and (doctor_filter is null or encounter.doctor_id = doctor_filter)
    group by 1
  ), production_by_day as (
    select (performed.performed_at at time zone organization_timezone)::date metric_date, sum(performed.final_amount)::numeric amount
    from public.performed_services performed join public.clinical_encounters encounter on encounter.organization_id = performed.organization_id and encounter.id = performed.encounter_id
    where performed.organization_id = org_id and performed.voided_at is null and (performed.performed_at at time zone organization_timezone)::date between report_start and report_end
      and (branch_filter is null or encounter.branch_id = branch_filter) and (doctor_filter is null or performed.doctor_id = doctor_filter)
    group by 1
  ) select days.metric_date, coalesce(invoices_by_day.amount, 0), coalesce(payments_by_day.amount, 0), coalesce(production_by_day.amount, 0)
  from days left join invoices_by_day using (metric_date) left join payments_by_day using (metric_date) left join production_by_day using (metric_date)
  order by days.metric_date;
end;
$$;

create or replace function public.get_doctor_performance(org_id uuid, report_start date, report_end date, branch_filter uuid default null, specialization_filter uuid default null)
returns table (doctor_id uuid, doctor_name text, specialization_name text, appointments_count bigint, completed_count bigint,
  no_show_count bigint, available_minutes numeric, completed_minutes numeric, production_amount numeric, material_cost numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare organization_timezone text; start_at timestamptz; end_at timestamptz;
begin
  if not public.current_user_has_permission(org_id, 'reports.read') then raise exception 'Reports read permission required' using errcode = '42501'; end if;
  if report_start is null or report_end is null or report_end < report_start or report_end - report_start > 366 then raise exception 'Report period is invalid'; end if;
  select timezone into organization_timezone from public.organizations where id = org_id;
  start_at := report_start::timestamp at time zone organization_timezone; end_at := (report_end + 1)::timestamp at time zone organization_timezone;
  return query
  with doctor_base as (
    select doctor.id, employee.full_name, specialization.name specialization_name
    from public.doctors doctor join public.employees employee on employee.organization_id = doctor.organization_id and employee.id = doctor.employee_id
    join public.specializations specialization on specialization.organization_id = doctor.organization_id and specialization.id = doctor.specialization_id
    where doctor.organization_id = org_id and (specialization_filter is null or doctor.specialization_id = specialization_filter)
  ), appointment_metrics as (
    select appointment.doctor_id, count(*)::bigint appointments, count(*) filter (where status.code = 'completed')::bigint completed,
      count(*) filter (where status.code = 'no_show')::bigint no_show,
      coalesce(sum(extract(epoch from (appointment.end_at - appointment.start_at)) / 60) filter (where status.code = 'completed'), 0)::numeric completed_minutes
    from public.appointments appointment join public.appointment_statuses status on status.id = appointment.status_id and status.organization_id = appointment.organization_id
    where appointment.organization_id = org_id and appointment.start_at >= start_at and appointment.start_at < end_at
      and (branch_filter is null or appointment.branch_id = branch_filter) group by appointment.doctor_id
  ), availability as (
    select doctor.id doctor_id, coalesce(sum(
      case
        when exists (
          select 1 from public.doctor_schedule_exceptions exception
          where exception.organization_id = doctor.organization_id and exception.doctor_id = doctor.id
            and exception.exception_date = day::date and exception.type in ('day_off', 'sick_leave', 'vacation', 'blocked')
        ) then 0
        when exists (
          select 1 from public.doctor_schedule_exceptions custom
          where custom.organization_id = doctor.organization_id and custom.doctor_id = doctor.id
            and custom.exception_date = day::date and custom.type = 'custom_hours'
        ) then coalesce((
          select sum(extract(epoch from (custom.end_time - custom.start_time)) / 60)
          from public.doctor_schedule_exceptions custom
          where custom.organization_id = doctor.organization_id and custom.doctor_id = doctor.id
            and custom.exception_date = day::date and custom.type = 'custom_hours'
        ), 0)
        else coalesce((
          select sum(extract(epoch from (hours.end_time - hours.start_time)) / 60)
          from public.doctor_working_hours hours
          where hours.organization_id = doctor.organization_id and hours.doctor_id = doctor.id
            and hours.weekday = extract(isodow from day)::integer and day::date >= hours.valid_from
            and (hours.valid_to is null or day::date <= hours.valid_to)
            and (branch_filter is null or hours.branch_id = branch_filter)
        ), 0)
      end
    ), 0)::numeric available_minutes
    from public.doctors doctor cross join generate_series(report_start, report_end, interval '1 day') day
    where doctor.organization_id = org_id group by doctor.id
  ), production as (
    select performed.doctor_id, coalesce(sum(performed.final_amount), 0)::numeric amount
    from public.performed_services performed join public.clinical_encounters encounter on encounter.organization_id = performed.organization_id and encounter.id = performed.encounter_id
    where performed.organization_id = org_id and performed.voided_at is null and performed.performed_at >= start_at and performed.performed_at < end_at
      and (branch_filter is null or encounter.branch_id = branch_filter) group by performed.doctor_id
  ), material as (
    select performed.doctor_id, coalesce(sum(-movement.quantity * coalesce(movement.unit_cost, 0)), 0)::numeric cost
    from public.stock_movements movement join public.performed_services performed on performed.organization_id = movement.organization_id and performed.id = movement.source_id
    join public.clinical_encounters encounter on encounter.organization_id = performed.organization_id and encounter.id = performed.encounter_id
    where movement.organization_id = org_id and movement.movement_type = 'procedure_usage' and movement.created_at >= start_at and movement.created_at < end_at
      and (branch_filter is null or encounter.branch_id = branch_filter) group by performed.doctor_id
  ) select doctor_base.id, doctor_base.full_name, doctor_base.specialization_name,
    coalesce(appointment_metrics.appointments, 0), coalesce(appointment_metrics.completed, 0), coalesce(appointment_metrics.no_show, 0),
    coalesce(availability.available_minutes, 0), coalesce(appointment_metrics.completed_minutes, 0),
    coalesce(production.amount, 0), coalesce(material.cost, 0)
  from doctor_base left join appointment_metrics on appointment_metrics.doctor_id = doctor_base.id
    left join availability on availability.doctor_id = doctor_base.id left join production on production.doctor_id = doctor_base.id
    left join material on material.doctor_id = doctor_base.id order by coalesce(production.amount, 0) desc, doctor_base.full_name;
end;
$$;

create or replace function public.get_reception_performance(org_id uuid, report_start date, report_end date, branch_filter uuid default null)
returns table (employee_id uuid, employee_name text, leads_count bigint, converted_leads_count bigint,
  appointments_created bigint, completed_appointments bigint, no_show_appointments bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare organization_timezone text; start_at timestamptz; end_at timestamptz;
begin
  if not public.current_user_has_permission(org_id, 'reports.read') then raise exception 'Reports read permission required' using errcode = '42501'; end if;
  if report_start is null or report_end is null or report_end < report_start or report_end - report_start > 366 then raise exception 'Report period is invalid'; end if;
  select timezone into organization_timezone from public.organizations where id = org_id;
  start_at := report_start::timestamp at time zone organization_timezone; end_at := (report_end + 1)::timestamp at time zone organization_timezone;
  return query
  with receptionists as (select employee.id, employee.full_name, employee.profile_id from public.employees employee where employee.organization_id = org_id and employee.employee_type = 'receptionist'),
  lead_metrics as (
    select member.employee_id, count(lead.id)::bigint leads, count(lead.id) filter (where lead.status = 'converted')::bigint converted
    from public.organization_members member join public.leads lead on lead.organization_id = member.organization_id and lead.assigned_to = member.id
    where member.organization_id = org_id and lead.created_at >= start_at and lead.created_at < end_at
      and (branch_filter is null or lead.branch_id = branch_filter) group by member.employee_id
  ), appointment_metrics as (
    select receptionist.id employee_id, count(appointment.id)::bigint appointments,
      count(appointment.id) filter (where status.code = 'completed')::bigint completed,
      count(appointment.id) filter (where status.code = 'no_show')::bigint no_show
    from receptionists receptionist join public.appointments appointment on appointment.organization_id = org_id and appointment.created_by = receptionist.profile_id
    join public.appointment_statuses status on status.organization_id = appointment.organization_id and status.id = appointment.status_id
    where appointment.created_at >= start_at and appointment.created_at < end_at and (branch_filter is null or appointment.branch_id = branch_filter)
    group by receptionist.id
  ) select receptionist.id, receptionist.full_name, coalesce(lead_metrics.leads, 0), coalesce(lead_metrics.converted, 0),
    coalesce(appointment_metrics.appointments, 0), coalesce(appointment_metrics.completed, 0), coalesce(appointment_metrics.no_show, 0)
  from receptionists receptionist left join lead_metrics on lead_metrics.employee_id = receptionist.id
    left join appointment_metrics on appointment_metrics.employee_id = receptionist.id order by coalesce(appointment_metrics.appointments, 0) desc, receptionist.full_name;
end;
$$;

create or replace function public.get_source_analytics(org_id uuid, report_start date, report_end date, branch_filter uuid default null, source_filter uuid default null)
returns table (source_id uuid, source_name text, source_color text, leads_count bigint, converted_count bigint,
  appointments_count bigint, completed_appointments_count bigint, revenue_amount numeric, payments_amount numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare organization_timezone text; start_at timestamptz; end_at timestamptz;
begin
  if not public.current_user_has_permission(org_id, 'reports.read') then raise exception 'Reports read permission required' using errcode = '42501'; end if;
  if report_start is null or report_end is null or report_end < report_start or report_end - report_start > 366 then raise exception 'Report period is invalid'; end if;
  select timezone into organization_timezone from public.organizations where id = org_id;
  start_at := report_start::timestamp at time zone organization_timezone; end_at := (report_end + 1)::timestamp at time zone organization_timezone;
  return query
  with period_leads as (
    select lead.* from public.leads lead where lead.organization_id = org_id and lead.created_at >= start_at and lead.created_at < end_at
      and (branch_filter is null or lead.branch_id = branch_filter)
  ), lead_metrics as (
    select lead.source_id, count(*)::bigint leads_count,
      count(*) filter (where lead.status = 'converted')::bigint converted_count
    from period_leads lead group by lead.source_id
  ), source_patients as (
    select distinct on (lead.converted_patient_id) lead.source_id, lead.converted_patient_id patient_id
    from public.leads lead
    where lead.organization_id = org_id and lead.converted_patient_id is not null
      and (branch_filter is null or lead.branch_id = branch_filter)
    order by lead.converted_patient_id, lead.created_at
  ), appointment_metrics as (
    select patient.source_id, count(*)::bigint appointments_count,
      count(*) filter (where appointment_status.code = 'completed')::bigint completed_count
    from source_patients patient join public.appointments appointment
      on appointment.organization_id = org_id and appointment.patient_id = patient.patient_id
      and appointment.start_at >= start_at and appointment.start_at < end_at
      and (branch_filter is null or appointment.branch_id = branch_filter)
    join public.appointment_statuses appointment_status
      on appointment_status.organization_id = appointment.organization_id and appointment_status.id = appointment.status_id
    group by patient.source_id
  ), invoice_metrics as (
    select patient.source_id, sum(invoice.total_amount)::numeric revenue_amount
    from source_patients patient join public.invoices invoice
      on invoice.organization_id = org_id and invoice.patient_id = patient.patient_id
      and invoice.issued_at >= start_at and invoice.issued_at < end_at
      and (branch_filter is null or invoice.branch_id = branch_filter)
    group by patient.source_id
  ), payment_metrics as (
    select patient.source_id, sum(payment.amount - payment.refunded_amount)::numeric payments_amount
    from source_patients patient join public.invoices invoice
      on invoice.organization_id = org_id and invoice.patient_id = patient.patient_id
    join public.payments payment on payment.organization_id = org_id and payment.invoice_id = invoice.id
      and payment.paid_at >= start_at and payment.paid_at < end_at and payment.status <> 'reversed'
      and (branch_filter is null or payment.branch_id = branch_filter)
    group by patient.source_id
  ) select source.id, source.name, source.color,
    coalesce(lead_metrics.leads_count, 0), coalesce(lead_metrics.converted_count, 0),
    coalesce(appointment_metrics.appointments_count, 0), coalesce(appointment_metrics.completed_count, 0),
    coalesce(invoice_metrics.revenue_amount, 0), coalesce(payment_metrics.payments_amount, 0)
  from public.patient_sources source
  left join lead_metrics on lead_metrics.source_id = source.id
  left join appointment_metrics on appointment_metrics.source_id = source.id
  left join invoice_metrics on invoice_metrics.source_id = source.id
  left join payment_metrics on payment_metrics.source_id = source.id
  where source.organization_id = org_id and (source_filter is null or source.id = source_filter)
  order by coalesce(invoice_metrics.revenue_amount, 0) desc, source.name;
end;
$$;

create or replace function public.get_inventory_analytics(org_id uuid, report_start date, report_end date, branch_filter uuid default null)
returns table (item_id uuid, sku text, item_name text, unit text, consumed_quantity numeric, consumed_cost numeric,
  written_off_quantity numeric, current_quantity numeric, current_value numeric, days_of_stock numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare organization_timezone text; start_at timestamptz; end_at timestamptz; period_days numeric;
begin
  if not public.current_user_has_permission(org_id, 'reports.read') then raise exception 'Reports read permission required' using errcode = '42501'; end if;
  if report_start is null or report_end is null or report_end < report_start or report_end - report_start > 366 then raise exception 'Report period is invalid'; end if;
  select timezone into organization_timezone from public.organizations where id = org_id;
  start_at := report_start::timestamp at time zone organization_timezone; end_at := (report_end + 1)::timestamp at time zone organization_timezone;
  period_days := report_end - report_start + 1;
  return query
  with period_usage as (
    select movement.inventory_item_id,
      coalesce(sum(-movement.quantity) filter (where movement.movement_type in ('issue', 'write_off', 'procedure_usage')), 0)::numeric consumed,
      coalesce(sum(-movement.quantity * coalesce(movement.unit_cost, 0)) filter (where movement.movement_type in ('issue', 'write_off', 'procedure_usage')), 0)::numeric cost,
      coalesce(sum(-movement.quantity) filter (where movement.movement_type = 'write_off'), 0)::numeric written_off
    from public.stock_movements movement join public.warehouses warehouse on warehouse.organization_id = movement.organization_id and warehouse.id = movement.warehouse_id
    where movement.organization_id = org_id and movement.created_at >= start_at and movement.created_at < end_at
      and (branch_filter is null or warehouse.branch_id = branch_filter) group by movement.inventory_item_id
  ), balances as (
    select movement.inventory_item_id, coalesce(sum(movement.quantity), 0)::numeric quantity,
      coalesce(sum(movement.quantity * coalesce(movement.unit_cost, 0)), 0)::numeric value
    from public.stock_movements movement join public.warehouses warehouse on warehouse.organization_id = movement.organization_id and warehouse.id = movement.warehouse_id
    where movement.organization_id = org_id and (branch_filter is null or warehouse.branch_id = branch_filter) group by movement.inventory_item_id
  ) select item.id, item.sku, item.name, item.unit, coalesce(period_usage.consumed, 0), coalesce(period_usage.cost, 0),
    coalesce(period_usage.written_off, 0), coalesce(balances.quantity, 0), coalesce(balances.value, 0),
    case when coalesce(period_usage.consumed, 0) > 0 then round(coalesce(balances.quantity, 0) / (period_usage.consumed / period_days), 1) else null end
  from public.inventory_items item left join period_usage on period_usage.inventory_item_id = item.id
    left join balances on balances.inventory_item_id = item.id
  where item.organization_id = org_id order by coalesce(period_usage.cost, 0) desc, item.name;
end;
$$;

create or replace function public.list_analytics_filters(org_id uuid)
returns table (entity_type text, id uuid, name text, color text)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'branch'::text as entity_type, branch.id as id, branch.name as name, null::text as color from public.branches branch
  where branch.organization_id = org_id and branch.is_active and public.current_user_has_permission(org_id, 'reports.read')
  union all
  select 'doctor', doctor.id, employee.full_name, employee.color from public.doctors doctor
  join public.employees employee on employee.organization_id = doctor.organization_id and employee.id = doctor.employee_id
  where doctor.organization_id = org_id and doctor.is_active and public.current_user_has_permission(org_id, 'reports.read')
  union all
  select 'source', source.id, source.name, source.color from public.patient_sources source
  where source.organization_id = org_id and source.is_active and public.current_user_has_permission(org_id, 'reports.read')
  union all
  select 'specialization', specialization.id, specialization.name, null::text from public.specializations specialization
  where specialization.organization_id = org_id and public.current_user_has_permission(org_id, 'reports.read')
  order by 1, 3;
$$;

revoke all on function public.save_compensation_rule(uuid, uuid, uuid, uuid, text, numeric, date, date) from public;
revoke all on function public.close_compensation_rule(uuid, uuid, date) from public;
revoke all on function public.post_compensation_entries(uuid, date, date) from public;
revoke all on function public.list_compensation_reference_data(uuid) from public;
revoke all on function public.list_compensation_rules(uuid) from public;
revoke all on function public.get_compensation_report(uuid, date, date) from public;
revoke all on function public.list_compensation_entries(uuid, date, date) from public;
revoke all on function public.get_executive_analytics(uuid, date, date, uuid, uuid) from public;
revoke all on function public.get_daily_analytics_series(uuid, date, date, uuid, uuid) from public;
revoke all on function public.get_doctor_performance(uuid, date, date, uuid, uuid) from public;
revoke all on function public.get_reception_performance(uuid, date, date, uuid) from public;
revoke all on function public.get_source_analytics(uuid, date, date, uuid, uuid) from public;
revoke all on function public.get_inventory_analytics(uuid, date, date, uuid) from public;
revoke all on function public.list_analytics_filters(uuid) from public;

grant execute on function public.save_compensation_rule(uuid, uuid, uuid, uuid, text, numeric, date, date) to authenticated;
grant execute on function public.close_compensation_rule(uuid, uuid, date) to authenticated;
grant execute on function public.post_compensation_entries(uuid, date, date) to authenticated;
grant execute on function public.list_compensation_reference_data(uuid) to authenticated;
grant execute on function public.list_compensation_rules(uuid) to authenticated;
grant execute on function public.get_compensation_report(uuid, date, date) to authenticated;
grant execute on function public.list_compensation_entries(uuid, date, date) to authenticated;
grant execute on function public.get_executive_analytics(uuid, date, date, uuid, uuid) to authenticated;
grant execute on function public.get_daily_analytics_series(uuid, date, date, uuid, uuid) to authenticated;
grant execute on function public.get_doctor_performance(uuid, date, date, uuid, uuid) to authenticated;
grant execute on function public.get_reception_performance(uuid, date, date, uuid) to authenticated;
grant execute on function public.get_source_analytics(uuid, date, date, uuid, uuid) to authenticated;
grant execute on function public.get_inventory_analytics(uuid, date, date, uuid) to authenticated;
grant execute on function public.list_analytics_filters(uuid) to authenticated;

commit;
