alter table public.treatment_plan_items
  add constraint treatment_plan_items_organization_id_id_key
  unique (organization_id, id);

create table public.performed_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  encounter_id uuid not null,
  patient_id uuid not null,
  doctor_id uuid not null,
  service_id uuid not null,
  treatment_plan_item_id uuid,
  service_code_snapshot text not null,
  service_name_snapshot text not null,
  tooth_code text,
  quantity numeric(10,2) not null check (quantity > 0 and quantity <= 100),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  final_amount numeric(14,2) not null,
  notes text,
  performed_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete restrict,
  void_reason text,
  constraint performed_services_encounter_fkey foreign key (organization_id, encounter_id)
    references public.clinical_encounters(organization_id, id) on delete restrict,
  constraint performed_services_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint performed_services_doctor_fkey foreign key (organization_id, doctor_id)
    references public.doctors(organization_id, id) on delete restrict,
  constraint performed_services_service_fkey foreign key (organization_id, service_id)
    references public.services(organization_id, id) on delete restrict,
  constraint performed_services_plan_item_fkey foreign key (organization_id, treatment_plan_item_id)
    references public.treatment_plan_items(organization_id, id) on delete restrict,
  constraint performed_services_tooth_code_check check (
    tooth_code is null or tooth_code = any(array[
      '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
      '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38',
      '55','54','53','52','51','61','62','63','64','65',
      '85','84','83','82','81','71','72','73','74','75'
    ])
  ),
  constraint performed_services_amount_calculation_check check (
    final_amount = round((quantity * unit_price) - discount_amount, 2)
    and discount_amount <= round(quantity * unit_price, 2)
  ),
  constraint performed_services_notes_length_check check (
    notes is null or char_length(notes) <= 2000
  ),
  constraint performed_services_void_state_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (
      voided_at is not null
      and voided_by is not null
      and void_reason is not null
      and char_length(trim(void_reason)) between 3 and 500
    )
  ),
  unique (organization_id, id)
);

create index performed_services_encounter_idx
  on public.performed_services (encounter_id, performed_at);
create index performed_services_patient_idx
  on public.performed_services (patient_id, performed_at desc)
  where voided_at is null;
create index performed_services_doctor_idx
  on public.performed_services (doctor_id, performed_at desc)
  where voided_at is null;
create index performed_services_plan_item_idx
  on public.performed_services (treatment_plan_item_id)
  where treatment_plan_item_id is not null and voided_at is null;

alter table public.performed_services enable row level security;

create policy performed_services_select on public.performed_services
for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'clinical.read')
  or public.current_user_has_permission(organization_id, 'finance.read')
);

grant select on public.performed_services to authenticated;

create or replace function public.add_performed_service(
  org_id uuid,
  target_encounter_id uuid,
  target_service_id uuid,
  target_plan_item_id uuid,
  target_tooth_code text,
  service_quantity numeric,
  service_discount_amount numeric,
  service_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  encounter_status text;
  encounter_patient_id uuid;
  encounter_doctor_id uuid;
  resolved_service_id uuid;
  resolved_service_code text;
  resolved_service_name text;
  resolved_tooth_code text;
  resolved_unit_price numeric(14,2);
  linked_plan_id uuid;
  linked_plan_status text;
  linked_plan_patient_id uuid;
  planned_quantity numeric(10,2);
  already_performed_quantity numeric(10,2);
  normalized_quantity numeric(10,2);
  normalized_discount numeric(14,2);
  gross_amount numeric(14,2);
  calculated_final_amount numeric(14,2);
  new_performed_service_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'clinical.write') then
    raise exception 'Clinical write permission required' using errcode = '42501';
  end if;

  select encounter.status, encounter.patient_id, encounter.doctor_id
  into encounter_status, encounter_patient_id, encounter_doctor_id
  from public.clinical_encounters encounter
  where encounter.id = target_encounter_id
    and encounter.organization_id = org_id
  for update;

  if encounter_status is null then
    raise exception 'Clinical encounter not found';
  end if;
  if encounter_status <> 'open' then
    raise exception 'Performed services can only be changed during an open encounter';
  end if;

  normalized_quantity := service_quantity;
  normalized_discount := coalesce(service_discount_amount, 0);
  resolved_tooth_code := nullif(trim(target_tooth_code), '');

  if normalized_quantity is null or normalized_quantity <= 0 or normalized_quantity > 100 then
    raise exception 'Performed service quantity is invalid';
  end if;
  if normalized_discount < 0 then
    raise exception 'Performed service discount is invalid';
  end if;
  if resolved_tooth_code is not null and not (resolved_tooth_code = any(array[
    '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
    '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38',
    '55','54','53','52','51','61','62','63','64','65',
    '85','84','83','82','81','71','72','73','74','75'
  ])) then
    raise exception 'Invalid FDI tooth code';
  end if;
  if service_notes is not null and char_length(trim(service_notes)) > 2000 then
    raise exception 'Performed service notes are too long';
  end if;

  if target_plan_item_id is not null then
    select
      item.service_id,
      item.service_code_snapshot,
      item.service_name_snapshot,
      coalesce(resolved_tooth_code, item.tooth_code),
      item.unit_price,
      item.quantity,
      plan.id,
      plan.status,
      plan.patient_id
    into
      resolved_service_id,
      resolved_service_code,
      resolved_service_name,
      resolved_tooth_code,
      resolved_unit_price,
      planned_quantity,
      linked_plan_id,
      linked_plan_status,
      linked_plan_patient_id
    from public.treatment_plan_items item
    join public.treatment_plan_versions version
      on version.id = item.treatment_plan_version_id
      and version.treatment_plan_id = item.treatment_plan_id
      and version.organization_id = item.organization_id
    join public.treatment_plans plan
      on plan.id = item.treatment_plan_id
      and plan.organization_id = item.organization_id
      and plan.current_version_no = version.version_no
    where item.id = target_plan_item_id
      and item.organization_id = org_id
    for update of item;

    if resolved_service_id is null then
      raise exception 'Current treatment plan item not found';
    end if;
    if linked_plan_patient_id <> encounter_patient_id then
      raise exception 'Treatment plan belongs to another patient';
    end if;
    if linked_plan_status not in ('approved', 'in_progress') then
      raise exception 'Treatment plan must be approved or in progress';
    end if;
    if target_service_id is not null and target_service_id <> resolved_service_id then
      raise exception 'Treatment plan item service does not match';
    end if;

    select coalesce(sum(performed.quantity), 0)
    into already_performed_quantity
    from public.performed_services performed
    where performed.organization_id = org_id
      and performed.treatment_plan_item_id = target_plan_item_id
      and performed.voided_at is null;

    if normalized_quantity > planned_quantity - already_performed_quantity then
      raise exception 'Performed quantity exceeds the remaining planned quantity';
    end if;
  else
    if target_service_id is null then
      raise exception 'Service is required';
    end if;

    select service.id, service.code, service.name, service.base_price
    into resolved_service_id, resolved_service_code, resolved_service_name, resolved_unit_price
    from public.services service
    where service.id = target_service_id
      and service.organization_id = org_id
      and service.is_active;

    if resolved_service_id is null then
      raise exception 'Active service not found';
    end if;
  end if;

  gross_amount := round(normalized_quantity * resolved_unit_price, 2);
  if normalized_discount > gross_amount then
    raise exception 'Performed service discount exceeds the gross amount';
  end if;
  calculated_final_amount := gross_amount - normalized_discount;

  insert into public.performed_services (
    organization_id, encounter_id, patient_id, doctor_id, service_id,
    treatment_plan_item_id, service_code_snapshot, service_name_snapshot,
    tooth_code, quantity, unit_price, discount_amount, final_amount,
    notes, created_by
  ) values (
    org_id, target_encounter_id, encounter_patient_id, encounter_doctor_id,
    resolved_service_id, target_plan_item_id, resolved_service_code,
    resolved_service_name, resolved_tooth_code, normalized_quantity,
    resolved_unit_price, normalized_discount, calculated_final_amount,
    nullif(trim(service_notes), ''), auth.uid()
  ) returning id into new_performed_service_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'performed_service.created', 'performed_service',
    new_performed_service_id,
    jsonb_build_object(
      'encounter_id', target_encounter_id,
      'patient_id', encounter_patient_id,
      'doctor_id', encounter_doctor_id,
      'service_id', resolved_service_id,
      'treatment_plan_item_id', target_plan_item_id,
      'quantity', normalized_quantity,
      'unit_price', resolved_unit_price,
      'discount_amount', normalized_discount,
      'final_amount', calculated_final_amount
    )
  );

  return new_performed_service_id;
end;
$$;

create or replace function public.void_performed_service(
  org_id uuid,
  target_performed_service_id uuid,
  void_reason_text text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_encounter_id uuid;
  encounter_status text;
  previous_voided_at timestamptz;
begin
  if not public.current_user_has_permission(org_id, 'clinical.write') then
    raise exception 'Clinical write permission required' using errcode = '42501';
  end if;
  if void_reason_text is null or char_length(trim(void_reason_text)) not between 3 and 500 then
    raise exception 'Void reason must contain between 3 and 500 characters';
  end if;

  select performed.encounter_id, encounter.status, performed.voided_at
  into target_encounter_id, encounter_status, previous_voided_at
  from public.performed_services performed
  join public.clinical_encounters encounter
    on encounter.id = performed.encounter_id
    and encounter.organization_id = performed.organization_id
  where performed.id = target_performed_service_id
    and performed.organization_id = org_id
  for update of performed, encounter;

  if target_encounter_id is null then
    raise exception 'Performed service not found';
  end if;
  if encounter_status <> 'open' then
    raise exception 'Performed services can only be changed during an open encounter';
  end if;
  if previous_voided_at is not null then
    raise exception 'Performed service is already voided';
  end if;

  update public.performed_services
  set voided_at = now(),
      voided_by = auth.uid(),
      void_reason = trim(void_reason_text)
  where id = target_performed_service_id and organization_id = org_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'performed_service.voided', 'performed_service',
    target_performed_service_id,
    jsonb_build_object(
      'encounter_id', target_encounter_id,
      'void_reason', trim(void_reason_text)
    )
  );
end;
$$;

create or replace function public.list_encounter_performed_services(
  org_id uuid,
  target_encounter_id uuid
)
returns table (
  id uuid,
  service_id uuid,
  treatment_plan_item_id uuid,
  service_code text,
  service_name text,
  tooth_code text,
  quantity numeric,
  unit_price numeric,
  discount_amount numeric,
  final_amount numeric,
  notes text,
  performed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  treatment_plan_id uuid,
  treatment_plan_title text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    performed.id,
    performed.service_id,
    performed.treatment_plan_item_id,
    performed.service_code_snapshot,
    performed.service_name_snapshot,
    performed.tooth_code,
    performed.quantity,
    performed.unit_price,
    performed.discount_amount,
    performed.final_amount,
    performed.notes,
    performed.performed_at,
    performed.voided_at,
    performed.void_reason,
    plan.id,
    plan.title
  from public.performed_services performed
  left join public.treatment_plan_items item
    on item.id = performed.treatment_plan_item_id
    and item.organization_id = performed.organization_id
  left join public.treatment_plans plan
    on plan.id = item.treatment_plan_id
    and plan.organization_id = item.organization_id
  where performed.organization_id = org_id
    and performed.encounter_id = target_encounter_id
    and (
      public.current_user_has_permission(org_id, 'clinical.read')
      or public.current_user_has_permission(org_id, 'finance.read')
    )
  order by performed.performed_at, performed.created_at;
$$;

create or replace function public.list_available_plan_items_for_encounter(
  org_id uuid,
  target_encounter_id uuid
)
returns table (
  treatment_plan_item_id uuid,
  treatment_plan_id uuid,
  treatment_plan_title text,
  service_id uuid,
  service_code text,
  service_name text,
  tooth_code text,
  remaining_quantity numeric,
  unit_price numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    item.id,
    plan.id,
    plan.title,
    item.service_id,
    item.service_code_snapshot,
    item.service_name_snapshot,
    item.tooth_code,
    item.quantity - coalesce(sum(performed.quantity) filter (where performed.voided_at is null), 0),
    item.unit_price
  from public.clinical_encounters encounter
  join public.treatment_plans plan
    on plan.organization_id = encounter.organization_id
    and plan.patient_id = encounter.patient_id
    and plan.status in ('approved', 'in_progress')
  join public.treatment_plan_versions version
    on version.organization_id = plan.organization_id
    and version.treatment_plan_id = plan.id
    and version.version_no = plan.current_version_no
  join public.treatment_plan_items item
    on item.organization_id = version.organization_id
    and item.treatment_plan_id = version.treatment_plan_id
    and item.treatment_plan_version_id = version.id
  left join public.performed_services performed
    on performed.organization_id = item.organization_id
    and performed.treatment_plan_item_id = item.id
  where encounter.organization_id = org_id
    and encounter.id = target_encounter_id
    and public.current_user_has_permission(org_id, 'clinical.read')
  group by item.id, plan.id, plan.title
  having item.quantity - coalesce(sum(performed.quantity) filter (where performed.voided_at is null), 0) > 0
  order by plan.updated_at desc, item.planned_order;
$$;

revoke all on function public.add_performed_service(
  uuid, uuid, uuid, uuid, text, numeric, numeric, text
) from public;
revoke all on function public.void_performed_service(uuid, uuid, text) from public;
revoke all on function public.list_encounter_performed_services(uuid, uuid) from public;
revoke all on function public.list_available_plan_items_for_encounter(uuid, uuid) from public;

grant execute on function public.add_performed_service(
  uuid, uuid, uuid, uuid, text, numeric, numeric, text
) to authenticated;
grant execute on function public.void_performed_service(uuid, uuid, text) to authenticated;
grant execute on function public.list_encounter_performed_services(uuid, uuid) to authenticated;
grant execute on function public.list_available_plan_items_for_encounter(uuid, uuid) to authenticated;
