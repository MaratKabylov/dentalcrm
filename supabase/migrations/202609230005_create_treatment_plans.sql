create table public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  doctor_id uuid not null,
  status text not null default 'draft' check (status in (
    'draft', 'proposed', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'
  )),
  title text not null check (char_length(trim(title)) between 2 and 240),
  current_version_no integer not null default 1 check (current_version_no > 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  final_amount numeric(14,2) not null default 0 check (final_amount >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  constraint treatment_plans_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint treatment_plans_doctor_fkey foreign key (organization_id, doctor_id)
    references public.doctors(organization_id, id) on delete restrict,
  constraint treatment_plans_totals_check check (
    discount_amount <= total_amount and final_amount = total_amount - discount_amount
  ),
  unique (organization_id, id)
);

create table public.treatment_plan_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  treatment_plan_id uuid not null,
  version_no integer not null check (version_no > 0),
  title text not null check (char_length(trim(title)) between 2 and 240),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  final_amount numeric(14,2) not null default 0 check (final_amount >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint treatment_plan_versions_plan_fkey foreign key (organization_id, treatment_plan_id)
    references public.treatment_plans(organization_id, id) on delete cascade,
  constraint treatment_plan_versions_totals_check check (
    discount_amount <= total_amount and final_amount = total_amount - discount_amount
  ),
  unique (organization_id, id),
  unique (treatment_plan_id, version_no),
  unique (organization_id, treatment_plan_id, id)
);

create table public.treatment_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  treatment_plan_id uuid not null,
  treatment_plan_version_id uuid not null,
  service_id uuid not null,
  service_code_snapshot text not null,
  service_name_snapshot text not null,
  tooth_code text,
  quantity numeric(10,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  amount numeric(14,2) not null check (amount >= 0),
  priority integer not null default 3 check (priority between 1 and 5),
  planned_order integer not null check (planned_order between 1 and 1000),
  status text not null default 'planned' check (status in (
    'planned', 'approved', 'in_progress', 'completed', 'cancelled'
  )),
  notes text,
  created_at timestamptz not null default now(),
  constraint treatment_plan_items_version_fkey
    foreign key (organization_id, treatment_plan_id, treatment_plan_version_id)
    references public.treatment_plan_versions(organization_id, treatment_plan_id, id)
    on delete cascade,
  constraint treatment_plan_items_service_fkey foreign key (organization_id, service_id)
    references public.services(organization_id, id) on delete restrict,
  constraint treatment_plan_items_tooth_code_check check (
    tooth_code is null or tooth_code = any(array[
      '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
      '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38',
      '55','54','53','52','51','61','62','63','64','65',
      '85','84','83','82','81','71','72','73','74','75'
    ])
  ),
  constraint treatment_plan_items_amount_calculation_check check (
    amount = round((quantity * unit_price) - discount_amount, 2)
    and discount_amount <= round(quantity * unit_price, 2)
  ),
  constraint treatment_plan_items_notes_length check (
    notes is null or char_length(notes) <= 2000
  ),
  unique (treatment_plan_version_id, planned_order)
);

create index treatment_plans_patient_idx
  on public.treatment_plans (patient_id, created_at desc);
create index treatment_plans_doctor_status_idx
  on public.treatment_plans (doctor_id, status, updated_at desc);
create index treatment_plan_versions_plan_idx
  on public.treatment_plan_versions (treatment_plan_id, version_no desc);
create index treatment_plan_items_version_idx
  on public.treatment_plan_items (treatment_plan_version_id, planned_order);

create trigger treatment_plans_set_updated_at before update on public.treatment_plans
for each row execute function public.set_updated_at();

alter table public.treatment_plans enable row level security;
alter table public.treatment_plan_versions enable row level security;
alter table public.treatment_plan_items enable row level security;

create policy treatment_plans_select on public.treatment_plans
for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'clinical.read')
  or public.current_user_has_permission(organization_id, 'treatment_plan.manage')
);
create policy treatment_plan_versions_select on public.treatment_plan_versions
for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'clinical.read')
  or public.current_user_has_permission(organization_id, 'treatment_plan.manage')
);
create policy treatment_plan_items_select on public.treatment_plan_items
for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'clinical.read')
  or public.current_user_has_permission(organization_id, 'treatment_plan.manage')
);

grant select on public.treatment_plans, public.treatment_plan_versions,
  public.treatment_plan_items to authenticated;

create or replace function public.save_treatment_plan(
  org_id uuid,
  target_plan_id uuid,
  target_patient_id uuid,
  target_doctor_id uuid,
  plan_title text,
  items_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_plan_id uuid;
  new_version_id uuid;
  new_version_no integer;
  current_status text;
  current_patient_id uuid;
  item jsonb;
  item_service_id uuid;
  item_service_code text;
  item_service_name text;
  item_tooth_code text;
  item_quantity numeric(10,2);
  item_unit_price numeric(14,2);
  item_discount numeric(14,2);
  item_gross numeric(14,2);
  item_amount numeric(14,2);
  item_priority integer;
  item_order integer;
  item_notes text;
  plan_total numeric(14,2) := 0;
  plan_discount numeric(14,2) := 0;
  plan_final numeric(14,2) := 0;
  item_count integer;
begin
  if not public.current_user_has_permission(org_id, 'treatment_plan.manage') then
    raise exception 'Treatment plan manage permission required' using errcode = '42501';
  end if;
  if plan_title is null or char_length(trim(plan_title)) not between 2 and 240 then
    raise exception 'Treatment plan title is invalid';
  end if;
  if items_payload is null or jsonb_typeof(items_payload) <> 'array' then
    raise exception 'Treatment plan items must be an array';
  end if;
  item_count := jsonb_array_length(items_payload);
  if item_count not between 1 and 100 then
    raise exception 'Treatment plan must contain between 1 and 100 items';
  end if;

  perform 1
  from public.patients patient
  where patient.id = target_patient_id
    and patient.organization_id = org_id
    and patient.archived_at is null;
  if not found then
    raise exception 'Active patient not found';
  end if;

  perform 1
  from public.doctors doctor
  join public.employees employee
    on employee.id = doctor.employee_id and employee.organization_id = doctor.organization_id
  where doctor.id = target_doctor_id
    and doctor.organization_id = org_id
    and doctor.is_active
    and employee.is_active;
  if not found then
    raise exception 'Active doctor not found';
  end if;

  if target_plan_id is null then
    insert into public.treatment_plans (
      organization_id, patient_id, doctor_id, status, title, current_version_no, created_by
    ) values (
      org_id, target_patient_id, target_doctor_id, 'draft', trim(plan_title), 1, auth.uid()
    ) returning id into saved_plan_id;
    new_version_no := 1;
  else
    select plan.status, plan.patient_id, plan.current_version_no + 1
    into current_status, current_patient_id, new_version_no
    from public.treatment_plans plan
    where plan.id = target_plan_id and plan.organization_id = org_id
    for update;

    if current_status is null then
      raise exception 'Treatment plan not found';
    end if;
    if current_patient_id <> target_patient_id then
      raise exception 'Treatment plan patient cannot be changed';
    end if;
    if current_status not in ('draft', 'proposed', 'rejected') then
      raise exception 'Accepted or completed treatment plans cannot be changed';
    end if;

    saved_plan_id := target_plan_id;
    update public.treatment_plans
    set doctor_id = target_doctor_id,
        title = trim(plan_title),
        current_version_no = new_version_no,
        status = 'draft',
        accepted_at = null,
        completed_at = null
    where id = saved_plan_id and organization_id = org_id;
  end if;

  insert into public.treatment_plan_versions (
    organization_id, treatment_plan_id, version_no, title, created_by
  ) values (
    org_id, saved_plan_id, new_version_no, trim(plan_title), auth.uid()
  ) returning id into new_version_id;

  for item in select value from jsonb_array_elements(items_payload)
  loop
    item_service_id := (item->>'serviceId')::uuid;
    item_tooth_code := nullif(trim(item->>'toothCode'), '');
    item_quantity := (item->>'quantity')::numeric;
    item_unit_price := (item->>'unitPrice')::numeric;
    item_discount := coalesce((item->>'discountAmount')::numeric, 0);
    item_priority := (item->>'priority')::integer;
    item_order := (item->>'plannedOrder')::integer;
    item_notes := item->>'notes';

    select service.code, service.name
    into item_service_code, item_service_name
    from public.services service
    where service.id = item_service_id
      and service.organization_id = org_id
      and (
        service.is_active
        or (
          target_plan_id is not null
          and exists (
            select 1
            from public.treatment_plan_items previous_item
            where previous_item.organization_id = org_id
              and previous_item.treatment_plan_id = target_plan_id
              and previous_item.service_id = item_service_id
          )
        )
      );
    if item_service_code is null then
      raise exception 'Active service not found';
    end if;
    if item_quantity <= 0 or item_quantity > 100 then
      raise exception 'Treatment plan item quantity is invalid';
    end if;
    if item_unit_price < 0 then
      raise exception 'Treatment plan item price is invalid';
    end if;
    item_gross := round(item_quantity * item_unit_price, 2);
    if item_discount < 0 or item_discount > item_gross then
      raise exception 'Treatment plan item discount is invalid';
    end if;
    item_amount := item_gross - item_discount;
    if item_priority not between 1 and 5 or item_order not between 1 and 1000 then
      raise exception 'Treatment plan item order or priority is invalid';
    end if;
    if item_tooth_code is not null and not (item_tooth_code = any(array[
      '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
      '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38',
      '55','54','53','52','51','61','62','63','64','65',
      '85','84','83','82','81','71','72','73','74','75'
    ])) then
      raise exception 'Invalid FDI tooth code';
    end if;
    if item_notes is not null and char_length(trim(item_notes)) > 2000 then
      raise exception 'Treatment plan item notes are too long';
    end if;

    insert into public.treatment_plan_items (
      organization_id, treatment_plan_id, treatment_plan_version_id,
      service_id, service_code_snapshot, service_name_snapshot, tooth_code,
      quantity, unit_price, discount_amount, amount, priority, planned_order, notes
    ) values (
      org_id, saved_plan_id, new_version_id,
      item_service_id, item_service_code, item_service_name, item_tooth_code,
      item_quantity, item_unit_price, item_discount, item_amount,
      item_priority, item_order, nullif(trim(item_notes), '')
    );

    plan_total := plan_total + item_gross;
    plan_discount := plan_discount + item_discount;
    plan_final := plan_final + item_amount;
  end loop;

  update public.treatment_plan_versions
  set total_amount = plan_total,
      discount_amount = plan_discount,
      final_amount = plan_final
  where id = new_version_id and organization_id = org_id;

  update public.treatment_plans
  set total_amount = plan_total,
      discount_amount = plan_discount,
      final_amount = plan_final
  where id = saved_plan_id and organization_id = org_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id,
    auth.uid(),
    case when new_version_no = 1 then 'treatment_plan.created' else 'treatment_plan.version_created' end,
    'treatment_plan',
    saved_plan_id,
    jsonb_build_object(
      'version_no', new_version_no,
      'item_count', item_count,
      'total_amount', plan_total,
      'discount_amount', plan_discount,
      'final_amount', plan_final
    )
  );

  return saved_plan_id;
end;
$$;

create or replace function public.change_treatment_plan_status(
  org_id uuid,
  target_plan_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_status text;
begin
  if not public.current_user_has_permission(org_id, 'treatment_plan.manage') then
    raise exception 'Treatment plan manage permission required' using errcode = '42501';
  end if;

  select plan.status into current_status
  from public.treatment_plans plan
  where plan.id = target_plan_id and plan.organization_id = org_id
  for update;
  if current_status is null then
    raise exception 'Treatment plan not found';
  end if;
  if not (
    (current_status = 'draft' and target_status in ('proposed', 'cancelled'))
    or (current_status = 'proposed' and target_status in ('approved', 'rejected', 'cancelled'))
    or (current_status = 'approved' and target_status in ('in_progress', 'cancelled'))
    or (current_status = 'in_progress' and target_status in ('completed', 'cancelled'))
    or (current_status = 'rejected' and target_status = 'cancelled')
  ) then
    raise exception 'Invalid treatment plan status transition';
  end if;

  update public.treatment_plans
  set status = target_status,
      accepted_at = case when target_status = 'approved' then now() else accepted_at end,
      completed_at = case when target_status = 'completed' then now() else completed_at end
  where id = target_plan_id and organization_id = org_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    org_id, auth.uid(), 'treatment_plan.status_changed', 'treatment_plan', target_plan_id,
    jsonb_build_object('status', current_status),
    jsonb_build_object('status', target_status)
  );
end;
$$;

create or replace function public.get_treatment_plan(org_id uuid, target_plan_id uuid)
returns table (
  id uuid,
  patient_id uuid,
  patient_name text,
  patient_external_number text,
  doctor_id uuid,
  doctor_name text,
  status text,
  title text,
  current_version_no integer,
  total_amount numeric,
  discount_amount numeric,
  final_amount numeric,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    plan.id,
    plan.patient_id,
    trim(concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name)),
    patient.external_number,
    plan.doctor_id,
    employee.full_name,
    plan.status,
    plan.title,
    plan.current_version_no,
    plan.total_amount,
    plan.discount_amount,
    plan.final_amount,
    plan.created_at,
    plan.updated_at,
    plan.accepted_at,
    plan.completed_at
  from public.treatment_plans plan
  join public.patients patient
    on patient.id = plan.patient_id and patient.organization_id = plan.organization_id
  join public.doctors doctor
    on doctor.id = plan.doctor_id and doctor.organization_id = plan.organization_id
  join public.employees employee
    on employee.id = doctor.employee_id and employee.organization_id = plan.organization_id
  where plan.id = target_plan_id
    and plan.organization_id = org_id
    and (
      public.current_user_has_permission(org_id, 'clinical.read')
      or public.current_user_has_permission(org_id, 'treatment_plan.manage')
    );
$$;

create or replace function public.list_treatment_plan_items(org_id uuid, target_plan_id uuid)
returns table (
  id uuid,
  service_id uuid,
  service_code text,
  service_name text,
  tooth_code text,
  quantity numeric,
  unit_price numeric,
  discount_amount numeric,
  amount numeric,
  priority integer,
  planned_order integer,
  status text,
  notes text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    item.id,
    item.service_id,
    item.service_code_snapshot,
    item.service_name_snapshot,
    item.tooth_code,
    item.quantity,
    item.unit_price,
    item.discount_amount,
    item.amount,
    item.priority,
    item.planned_order,
    item.status,
    item.notes
  from public.treatment_plan_items item
  join public.treatment_plans plan
    on plan.id = item.treatment_plan_id and plan.organization_id = item.organization_id
  join public.treatment_plan_versions version
    on version.id = item.treatment_plan_version_id
    and version.treatment_plan_id = plan.id
    and version.organization_id = plan.organization_id
  where item.organization_id = org_id
    and item.treatment_plan_id = target_plan_id
    and version.version_no = plan.current_version_no
    and (
      public.current_user_has_permission(org_id, 'clinical.read')
      or public.current_user_has_permission(org_id, 'treatment_plan.manage')
    )
  order by item.planned_order;
$$;

create or replace function public.list_treatment_plan_versions(org_id uuid, target_plan_id uuid)
returns table (
  id uuid,
  version_no integer,
  title text,
  total_amount numeric,
  discount_amount numeric,
  final_amount numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    version.id,
    version.version_no,
    version.title,
    version.total_amount,
    version.discount_amount,
    version.final_amount,
    version.created_at
  from public.treatment_plan_versions version
  where version.organization_id = org_id
    and version.treatment_plan_id = target_plan_id
    and (
      public.current_user_has_permission(org_id, 'clinical.read')
      or public.current_user_has_permission(org_id, 'treatment_plan.manage')
    )
  order by version.version_no desc;
$$;

create or replace function public.list_patient_treatment_plans(org_id uuid, target_patient_id uuid)
returns table (
  id uuid,
  doctor_name text,
  status text,
  title text,
  current_version_no integer,
  total_amount numeric,
  discount_amount numeric,
  final_amount numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    plan.id,
    employee.full_name,
    plan.status,
    plan.title,
    plan.current_version_no,
    plan.total_amount,
    plan.discount_amount,
    plan.final_amount,
    plan.created_at,
    plan.updated_at
  from public.treatment_plans plan
  join public.doctors doctor
    on doctor.id = plan.doctor_id and doctor.organization_id = plan.organization_id
  join public.employees employee
    on employee.id = doctor.employee_id and employee.organization_id = plan.organization_id
  where plan.organization_id = org_id
    and plan.patient_id = target_patient_id
    and (
      public.current_user_has_permission(org_id, 'clinical.read')
      or public.current_user_has_permission(org_id, 'treatment_plan.manage')
    )
  order by plan.updated_at desc;
$$;

revoke all on function public.save_treatment_plan(uuid, uuid, uuid, uuid, text, jsonb) from public;
revoke all on function public.change_treatment_plan_status(uuid, uuid, text) from public;
revoke all on function public.get_treatment_plan(uuid, uuid) from public;
revoke all on function public.list_treatment_plan_items(uuid, uuid) from public;
revoke all on function public.list_treatment_plan_versions(uuid, uuid) from public;
revoke all on function public.list_patient_treatment_plans(uuid, uuid) from public;

grant execute on function public.save_treatment_plan(uuid, uuid, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.change_treatment_plan_status(uuid, uuid, text) to authenticated;
grant execute on function public.get_treatment_plan(uuid, uuid) to authenticated;
grant execute on function public.list_treatment_plan_items(uuid, uuid) to authenticated;
grant execute on function public.list_treatment_plan_versions(uuid, uuid) to authenticated;
grant execute on function public.list_patient_treatment_plans(uuid, uuid) to authenticated;
