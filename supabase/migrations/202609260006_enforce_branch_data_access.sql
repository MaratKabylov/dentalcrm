begin;

-- Every write to a branch-owned row is checked even when it comes from a
-- SECURITY DEFINER RPC. Internal jobs without an authenticated user keep
-- working, while authenticated calls are always limited to allowed branches.
create or replace function public.enforce_branch_access_on_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  payload jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_organization_id uuid := (payload ->> 'organization_id')::uuid;
  row_branch_id uuid := nullif(payload ->> 'branch_id', '')::uuid;
  branch_is_optional boolean := coalesce(tg_argv[0], 'required') = 'optional';
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Organization bootstrap seeds branch-owned defaults before the owner
  -- membership is inserted in the same transaction.
  if not exists (
    select 1 from public.organization_members member
    where member.organization_id = row_organization_id
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if row_branch_id is null and branch_is_optional then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if row_branch_id is null
    or not public.current_user_has_branch_access(row_organization_id, row_branch_id)
  then
    raise exception 'Branch data access required' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.enforce_related_branch_access_on_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  payload jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_organization_id uuid := (payload ->> 'organization_id')::uuid;
  related_branch_id uuid;
  secondary_branch_id uuid;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  case tg_table_name
    when 'appointment_status_history' then
      select appointment.branch_id into related_branch_id
      from public.appointments appointment
      where appointment.organization_id = row_organization_id
        and appointment.id = (payload ->> 'appointment_id')::uuid;
    when 'invoice_items' then
      select invoice.branch_id into related_branch_id
      from public.invoices invoice
      where invoice.organization_id = row_organization_id
        and invoice.id = (payload ->> 'invoice_id')::uuid;
    when 'cash_shifts' then
      select desk.branch_id into related_branch_id
      from public.cash_desks desk
      where desk.organization_id = row_organization_id
        and desk.id = (payload ->> 'cash_desk_id')::uuid;
    when 'patient_ledger_entries' then
      select invoice.branch_id, payment.branch_id
      into related_branch_id, secondary_branch_id
      from (values (1)) marker(value)
      left join public.invoices invoice
        on invoice.organization_id = row_organization_id
        and invoice.id = nullif(payload ->> 'invoice_id', '')::uuid
      left join public.payments payment
        on payment.organization_id = row_organization_id
        and payment.id = nullif(payload ->> 'payment_id', '')::uuid;
    when 'payment_reversals' then
      select payment.branch_id into related_branch_id
      from public.payments payment
      where payment.organization_id = row_organization_id
        and payment.id = (payload ->> 'payment_id')::uuid;
    when 'discount_applications' then
      select invoice.branch_id into related_branch_id
      from public.invoices invoice
      where invoice.organization_id = row_organization_id
        and invoice.id = (payload ->> 'invoice_id')::uuid;
    when 'lead_activities' then
      select lead.branch_id into related_branch_id
      from public.leads lead
      where lead.organization_id = row_organization_id
        and lead.id = (payload ->> 'lead_id')::uuid;
    when 'communication_messages' then
      select lead.branch_id into related_branch_id
      from public.leads lead
      where lead.organization_id = row_organization_id
        and lead.id = nullif(payload ->> 'lead_id', '')::uuid;
    when 'performed_services' then
      select encounter.branch_id into related_branch_id
      from public.clinical_encounters encounter
      where encounter.organization_id = row_organization_id
        and encounter.id = (payload ->> 'encounter_id')::uuid;
    when 'encounter_diagnoses' then
      select encounter.branch_id into related_branch_id
      from public.clinical_encounters encounter
      where encounter.organization_id = row_organization_id
        and encounter.id = (payload ->> 'encounter_id')::uuid;
    when 'stock_batches' then
      select warehouse.branch_id into related_branch_id
      from public.warehouses warehouse
      where warehouse.organization_id = row_organization_id
        and warehouse.id = (payload ->> 'warehouse_id')::uuid;
    when 'stock_movements' then
      select warehouse.branch_id into related_branch_id
      from public.warehouses warehouse
      where warehouse.organization_id = row_organization_id
        and warehouse.id = (payload ->> 'warehouse_id')::uuid;
    else
      raise exception 'Unsupported branch-owned relation %', tg_table_name;
  end case;

  -- A nullable parent branch represents an organization-wide CRM record.
  if related_branch_id is not null
    and not public.current_user_has_branch_access(row_organization_id, related_branch_id)
  then
    raise exception 'Related branch data access required' using errcode = '42501';
  end if;
  if secondary_branch_id is not null
    and not public.current_user_has_branch_access(row_organization_id, secondary_branch_id)
  then
    raise exception 'Related branch data access required' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger appointments_enforce_branch_access
before insert or update or delete on public.appointments
for each row execute function public.enforce_branch_access_on_row('required');
create trigger clinical_encounters_enforce_branch_write_access
before insert or update or delete on public.clinical_encounters
for each row execute function public.enforce_branch_access_on_row('required');
create trigger invoices_enforce_branch_access
before insert or update or delete on public.invoices
for each row execute function public.enforce_branch_access_on_row('required');
create trigger cash_desks_enforce_branch_access
before insert or update or delete on public.cash_desks
for each row execute function public.enforce_branch_access_on_row('required');
create trigger payments_enforce_branch_access
before insert or update or delete on public.payments
for each row execute function public.enforce_branch_access_on_row('required');
create trigger payment_refunds_enforce_branch_access
before insert or update or delete on public.payment_refunds
for each row execute function public.enforce_branch_access_on_row('required');
create trigger leads_enforce_branch_access
before insert or update or delete on public.leads
for each row execute function public.enforce_branch_access_on_row('optional');
create trigger tasks_enforce_branch_access
before insert or update or delete on public.tasks
for each row execute function public.enforce_branch_access_on_row('optional');
create trigger marketing_campaigns_enforce_branch_access
before insert or update or delete on public.marketing_campaigns
for each row execute function public.enforce_branch_access_on_row('optional');
create trigger warehouses_enforce_branch_access
before insert or update or delete on public.warehouses
for each row execute function public.enforce_branch_access_on_row('required');

create trigger appointment_history_enforce_branch_access
before insert or update or delete on public.appointment_status_history
for each row execute function public.enforce_related_branch_access_on_row();
create trigger invoice_items_enforce_branch_access
before insert or update or delete on public.invoice_items
for each row execute function public.enforce_related_branch_access_on_row();
create trigger cash_shifts_enforce_branch_access
before insert or update or delete on public.cash_shifts
for each row execute function public.enforce_related_branch_access_on_row();
create trigger patient_ledger_enforce_branch_access
before insert or update or delete on public.patient_ledger_entries
for each row execute function public.enforce_related_branch_access_on_row();
create trigger payment_reversals_enforce_branch_access
before insert or update or delete on public.payment_reversals
for each row execute function public.enforce_related_branch_access_on_row();
create trigger discount_applications_enforce_branch_access
before insert or update or delete on public.discount_applications
for each row execute function public.enforce_related_branch_access_on_row();
create trigger lead_activities_enforce_branch_access
before insert or update or delete on public.lead_activities
for each row execute function public.enforce_related_branch_access_on_row();
create trigger communication_messages_enforce_branch_access
before insert or update or delete on public.communication_messages
for each row execute function public.enforce_related_branch_access_on_row();
create trigger performed_services_enforce_branch_write_access
before insert or update or delete on public.performed_services
for each row execute function public.enforce_related_branch_access_on_row();
create trigger encounter_diagnoses_enforce_branch_write_access
before insert or update or delete on public.encounter_diagnoses
for each row execute function public.enforce_related_branch_access_on_row();
create trigger stock_batches_enforce_branch_access
before insert or update or delete on public.stock_batches
for each row execute function public.enforce_related_branch_access_on_row();
create trigger stock_movements_enforce_branch_access
before insert or update or delete on public.stock_movements
for each row execute function public.enforce_related_branch_access_on_row();

-- Branch-aware read policies. Patient and clinical-history policies are kept
-- organization-wide by design.
drop policy appointments_select on public.appointments;
create policy appointments_select on public.appointments for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'appointments.read')
  and public.current_user_has_branch_access(organization_id, branch_id)
);

drop policy appointment_status_history_select on public.appointment_status_history;
create policy appointment_status_history_select on public.appointment_status_history for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'appointments.read')
  and exists (
    select 1 from public.appointments appointment
    where appointment.organization_id = appointment_status_history.organization_id
      and appointment.id = appointment_status_history.appointment_id
      and public.current_user_has_branch_access(appointment.organization_id, appointment.branch_id)
  )
);

drop policy invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  and public.current_user_has_branch_access(organization_id, branch_id)
);

drop policy invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  and exists (
    select 1 from public.invoices invoice
    where invoice.organization_id = invoice_items.organization_id
      and invoice.id = invoice_items.invoice_id
      and public.current_user_has_branch_access(invoice.organization_id, invoice.branch_id)
  )
);

drop policy cash_desks_select on public.cash_desks;
create policy cash_desks_select on public.cash_desks for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  and public.current_user_has_branch_access(organization_id, branch_id)
);

drop policy cash_shifts_select on public.cash_shifts;
create policy cash_shifts_select on public.cash_shifts for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  and exists (
    select 1 from public.cash_desks desk
    where desk.organization_id = cash_shifts.organization_id
      and desk.id = cash_shifts.cash_desk_id
      and public.current_user_has_branch_access(desk.organization_id, desk.branch_id)
  )
);

drop policy payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  and public.current_user_has_branch_access(organization_id, branch_id)
);

drop policy patient_ledger_select on public.patient_ledger_entries;
create policy patient_ledger_select on public.patient_ledger_entries for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  and (
    invoice_id is null
    or exists (
      select 1 from public.invoices invoice
      where invoice.organization_id = patient_ledger_entries.organization_id
        and invoice.id = patient_ledger_entries.invoice_id
        and public.current_user_has_branch_access(invoice.organization_id, invoice.branch_id)
    )
  )
  and (
    payment_id is null
    or exists (
      select 1 from public.payments payment
      where payment.organization_id = patient_ledger_entries.organization_id
        and payment.id = patient_ledger_entries.payment_id
        and public.current_user_has_branch_access(payment.organization_id, payment.branch_id)
    )
  )
);

drop policy payment_reversals_select on public.payment_reversals;
create policy payment_reversals_select on public.payment_reversals for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  and exists (
    select 1 from public.payments payment
    where payment.organization_id = payment_reversals.organization_id
      and payment.id = payment_reversals.payment_id
      and public.current_user_has_branch_access(payment.organization_id, payment.branch_id)
  )
);

drop policy payment_refunds_select on public.payment_refunds;
create policy payment_refunds_select on public.payment_refunds for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  and public.current_user_has_branch_access(organization_id, branch_id)
);

drop policy discount_applications_select on public.discount_applications;
create policy discount_applications_select on public.discount_applications for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'finance.read')
  and exists (
    select 1 from public.invoices invoice
    where invoice.organization_id = discount_applications.organization_id
      and invoice.id = discount_applications.invoice_id
      and public.current_user_has_branch_access(invoice.organization_id, invoice.branch_id)
  )
);

drop policy leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'crm.read')
  and (branch_id is null or public.current_user_has_branch_access(organization_id, branch_id))
);

drop policy lead_activities_select on public.lead_activities;
create policy lead_activities_select on public.lead_activities for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'crm.read')
  and exists (
    select 1 from public.leads lead
    where lead.organization_id = lead_activities.organization_id
      and lead.id = lead_activities.lead_id
      and (lead.branch_id is null or public.current_user_has_branch_access(lead.organization_id, lead.branch_id))
  )
);

drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'tasks.read')
  and (branch_id is null or public.current_user_has_branch_access(organization_id, branch_id))
);

drop policy marketing_campaigns_select on public.marketing_campaigns;
create policy marketing_campaigns_select on public.marketing_campaigns for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'crm.read')
  and (branch_id is null or public.current_user_has_branch_access(organization_id, branch_id))
);

drop policy communication_messages_select on public.communication_messages;
create policy communication_messages_select on public.communication_messages for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'communications.read')
  and (
    lead_id is null
    or exists (
      select 1 from public.leads lead
      where lead.organization_id = communication_messages.organization_id
        and lead.id = communication_messages.lead_id
        and (lead.branch_id is null or public.current_user_has_branch_access(lead.organization_id, lead.branch_id))
    )
  )
);

drop policy warehouses_select on public.warehouses;
create policy warehouses_select on public.warehouses for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'inventory.read')
  and public.current_user_has_branch_access(organization_id, branch_id)
);

drop policy stock_batches_select on public.stock_batches;
create policy stock_batches_select on public.stock_batches for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'inventory.read')
  and exists (
    select 1 from public.warehouses warehouse
    where warehouse.organization_id = stock_batches.organization_id
      and warehouse.id = stock_batches.warehouse_id
      and public.current_user_has_branch_access(warehouse.organization_id, warehouse.branch_id)
  )
);

drop policy stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'inventory.read')
  and exists (
    select 1 from public.warehouses warehouse
    where warehouse.organization_id = stock_movements.organization_id
      and warehouse.id = stock_movements.warehouse_id
      and public.current_user_has_branch_access(warehouse.organization_id, warehouse.branch_id)
  )
);

-- Payroll snapshots inherit the branch of their invoice. The percentage rule
-- itself remains organization-wide, as agreed.
alter table public.compensation_entries add column branch_id uuid;
update public.compensation_entries entry
set branch_id = invoice.branch_id
from public.invoice_items item
join public.invoices invoice
  on invoice.organization_id = item.organization_id and invoice.id = item.invoice_id
where item.organization_id = entry.organization_id and item.id = entry.invoice_item_id;
alter table public.compensation_entries
  alter column branch_id set not null,
  add constraint compensation_entries_branch_fkey
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict;
create index compensation_entries_branch_period_idx
  on public.compensation_entries (organization_id, branch_id, performed_at desc);

create or replace function public.set_compensation_entry_branch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select invoice.branch_id into new.branch_id
  from public.invoice_items item
  join public.invoices invoice
    on invoice.organization_id = item.organization_id and invoice.id = item.invoice_id
  where item.organization_id = new.organization_id and item.id = new.invoice_item_id;
  if new.branch_id is null then raise exception 'Compensation invoice branch not found'; end if;
  if auth.uid() is not null
    and not public.current_user_has_branch_access(new.organization_id, new.branch_id)
  then raise exception 'Compensation branch access required' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger compensation_entries_set_branch
before insert or update of invoice_item_id on public.compensation_entries
for each row execute function public.set_compensation_entry_branch();

drop policy compensation_entries_select on public.compensation_entries;
create policy compensation_entries_select on public.compensation_entries for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'payroll.read')
  and public.current_user_has_branch_access(organization_id, branch_id)
);

-- Read-only RPCs run as the caller so the policies above remain effective.
do $$
declare function_oid oid;
begin
  for function_oid in
    select proc.oid
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.prosecdef
      and proc.proname = any(array[
        'list_crm_branches','list_crm_leads','get_crm_lead','list_lead_activities',
        'list_marketing_campaigns','get_lead_attribution','list_marketing_attribution',
        'list_tasks','get_task_summary','list_task_branches','list_task_relation_options',
        'list_invoices','get_invoice','list_invoice_items','get_invoice_summary',
        'get_debt_aging_summary','list_debt_invoices','list_invoice_discount_applications',
        'list_cash_desks','list_payments','list_payment_refunds','list_patient_ledger',
        'list_inventory_reference_data','list_inventory_branches','list_inventory_balances',
        'list_stock_batches','list_stock_movements','list_pending_procedure_material_usage',
        'get_compensation_report','list_compensation_entries','list_analytics_filters',
        'get_executive_analytics','get_daily_analytics_series','get_doctor_performance',
        'get_reception_performance','get_source_analytics','get_inventory_analytics',
        'list_communication_targets','list_communication_messages','get_communication_summary'
      ]::text[])
  loop
    execute format('alter function %s security invoker', function_oid::regprocedure);
  end loop;
end;
$$;

-- Finance can read closed clinical encounters across the organization, but
-- the billable queue is operational and therefore branch-scoped.
create or replace function public.list_billable_encounters(org_id uuid)
returns table (
  encounter_id uuid, patient_id uuid, patient_name text,
  patient_external_number text, doctor_name text, branch_name text,
  closed_at timestamptz, procedure_count bigint, total_amount numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select encounter.id, encounter.patient_id,
    trim(concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name)),
    patient.external_number, employee.full_name, branch.name, encounter.closed_at,
    count(performed.id), sum(performed.final_amount)
  from public.clinical_encounters encounter
  join public.patients patient
    on patient.id = encounter.patient_id and patient.organization_id = encounter.organization_id
  join public.doctors doctor
    on doctor.id = encounter.doctor_id and doctor.organization_id = encounter.organization_id
  join public.employees employee
    on employee.id = doctor.employee_id and employee.organization_id = encounter.organization_id
  join public.branches branch
    on branch.id = encounter.branch_id and branch.organization_id = encounter.organization_id
  join public.performed_services performed
    on performed.encounter_id = encounter.id
    and performed.organization_id = encounter.organization_id
    and performed.voided_at is null
  left join public.invoices invoice
    on invoice.encounter_id = encounter.id and invoice.organization_id = encounter.organization_id
  where encounter.organization_id = org_id
    and encounter.status = 'closed'
    and invoice.id is null
    and public.current_user_has_permission(org_id, 'finance.read')
    and public.current_user_has_branch_access(org_id, encounter.branch_id)
  group by encounter.id, patient.id, employee.id, branch.id
  order by encounter.closed_at;
$$;

create or replace function public.list_pending_procedure_material_usage(org_id uuid)
returns table (
  performed_service_id uuid, performed_at timestamptz, patient_name text,
  service_name text, norm_id uuid, item_id uuid, item_name text, item_sku text,
  unit text, suggested_quantity numeric, remaining_quantity numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select performed.id, performed.performed_at,
    trim(patient.last_name || ' ' || patient.first_name || coalesce(' ' || patient.middle_name, '')),
    performed.service_name_snapshot, norm.id, item.id, item.name, item.sku, item.unit,
    performed.quantity * norm.quantity,
    performed.quantity * norm.quantity - coalesce(-sum(movement.quantity), 0)
  from public.performed_services performed
  join public.clinical_encounters encounter
    on encounter.organization_id = performed.organization_id and encounter.id = performed.encounter_id
  join public.patients patient
    on patient.organization_id = performed.organization_id and patient.id = performed.patient_id
  join public.service_material_norms norm
    on norm.organization_id = performed.organization_id
    and norm.service_id = performed.service_id and norm.is_active
  join public.inventory_items item
    on item.organization_id = norm.organization_id and item.id = norm.inventory_item_id
  left join public.stock_movements movement
    on movement.organization_id = performed.organization_id
    and movement.movement_type = 'procedure_usage' and movement.source_id = performed.id
    and movement.service_material_norm_id = norm.id
  where performed.organization_id = org_id and performed.voided_at is null
    and public.current_user_has_permission(org_id, 'inventory.read')
    and public.current_user_has_branch_access(org_id, encounter.branch_id)
  group by performed.id, patient.id, norm.id, item.id
  having performed.quantity * norm.quantity - coalesce(-sum(movement.quantity), 0) > 0
  order by performed.performed_at desc
  limit 500;
$$;

revoke all on function public.enforce_branch_access_on_row() from public;
revoke all on function public.enforce_related_branch_access_on_row() from public;
revoke all on function public.set_compensation_entry_branch() from public;

commit;
