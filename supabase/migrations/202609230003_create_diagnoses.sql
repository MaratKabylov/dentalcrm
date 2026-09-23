create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (char_length(trim(code)) between 1 and 32),
  name text not null check (char_length(trim(name)) between 2 and 300),
  system text not null check (system in ('local', 'icd10')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, system, code)
);

create table public.encounter_diagnoses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  encounter_id uuid not null,
  diagnosis_id uuid not null,
  tooth_code text,
  type text not null check (type in ('primary', 'secondary', 'differential')),
  notes text,
  diagnosed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint encounter_diagnoses_encounter_fkey foreign key (organization_id, encounter_id)
    references public.clinical_encounters(organization_id, id) on delete cascade,
  constraint encounter_diagnoses_diagnosis_fkey foreign key (organization_id, diagnosis_id)
    references public.diagnoses(organization_id, id) on delete restrict,
  constraint encounter_diagnoses_tooth_code_check check (
    tooth_code is null or tooth_code = any(array[
      '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
      '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38',
      '55','54','53','52','51','61','62','63','64','65',
      '85','84','83','82','81','71','72','73','74','75'
    ])
  ),
  constraint encounter_diagnoses_notes_length check (
    notes is null or char_length(notes) <= 2000
  ),
  constraint encounter_diagnoses_unique
    unique nulls not distinct (encounter_id, diagnosis_id, tooth_code)
);

create index diagnoses_active_search_idx
  on public.diagnoses (organization_id, system, code) where is_active;
create index encounter_diagnoses_encounter_idx
  on public.encounter_diagnoses (encounter_id, created_at);

create trigger diagnoses_set_updated_at before update on public.diagnoses
for each row execute function public.set_updated_at();
create trigger encounter_diagnoses_set_updated_at before update on public.encounter_diagnoses
for each row execute function public.set_updated_at();

alter table public.diagnoses enable row level security;
alter table public.encounter_diagnoses enable row level security;

create policy diagnoses_select on public.diagnoses
for select to authenticated
using (public.current_user_has_permission(organization_id, 'clinical.read'));
create policy encounter_diagnoses_select on public.encounter_diagnoses
for select to authenticated
using (public.current_user_has_permission(organization_id, 'clinical.read'));

grant select on public.diagnoses, public.encounter_diagnoses to authenticated;

create or replace function public.add_encounter_diagnosis(
  org_id uuid,
  target_encounter_id uuid,
  selected_diagnosis_id uuid,
  diagnosis_code text,
  diagnosis_name text,
  diagnosis_system text,
  target_tooth_code text,
  diagnosis_type text,
  diagnosis_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  encounter_status text;
  resolved_diagnosis_id uuid;
  normalized_code text;
  new_encounter_diagnosis_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'clinical.write') then
    raise exception 'Clinical write permission required' using errcode = '42501';
  end if;

  select encounter.status into encounter_status
  from public.clinical_encounters encounter
  where encounter.id = target_encounter_id
    and encounter.organization_id = org_id
  for update;
  if encounter_status is null then
    raise exception 'Clinical encounter not found';
  end if;
  if encounter_status <> 'open' then
    raise exception 'Diagnoses can only be changed during an open encounter';
  end if;

  if diagnosis_type not in ('primary', 'secondary', 'differential') then
    raise exception 'Invalid diagnosis type';
  end if;
  if target_tooth_code is not null and target_tooth_code <> '' and not (
    target_tooth_code = any(array[
      '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
      '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38',
      '55','54','53','52','51','61','62','63','64','65',
      '85','84','83','82','81','71','72','73','74','75'
    ])
  ) then
    raise exception 'Invalid FDI tooth code';
  end if;
  if diagnosis_notes is not null and char_length(trim(diagnosis_notes)) > 2000 then
    raise exception 'Diagnosis notes are too long';
  end if;

  if selected_diagnosis_id is not null then
    select diagnosis.id into resolved_diagnosis_id
    from public.diagnoses diagnosis
    where diagnosis.id = selected_diagnosis_id
      and diagnosis.organization_id = org_id
      and diagnosis.is_active;
    if resolved_diagnosis_id is null then
      raise exception 'Active diagnosis not found';
    end if;
  else
    normalized_code := upper(trim(diagnosis_code));
    if normalized_code is null or char_length(normalized_code) not between 1 and 32 then
      raise exception 'Diagnosis code is required';
    end if;
    if diagnosis_name is null or char_length(trim(diagnosis_name)) not between 2 and 300 then
      raise exception 'Diagnosis name is required';
    end if;
    if diagnosis_system not in ('local', 'icd10') then
      raise exception 'Invalid diagnosis system';
    end if;

    insert into public.diagnoses (organization_id, code, name, system)
    values (org_id, normalized_code, trim(diagnosis_name), diagnosis_system)
    on conflict (organization_id, system, code)
    do update set is_active = true
    returning id into resolved_diagnosis_id;
  end if;

  insert into public.encounter_diagnoses (
    organization_id, encounter_id, diagnosis_id, tooth_code, type, notes, diagnosed_by
  ) values (
    org_id,
    target_encounter_id,
    resolved_diagnosis_id,
    nullif(trim(target_tooth_code), ''),
    diagnosis_type,
    nullif(trim(diagnosis_notes), ''),
    auth.uid()
  )
  on conflict on constraint encounter_diagnoses_unique
  do update set
    type = excluded.type,
    notes = excluded.notes,
    diagnosed_by = auth.uid()
  returning id into new_encounter_diagnosis_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'encounter_diagnosis.saved', 'encounter_diagnosis',
    new_encounter_diagnosis_id,
    jsonb_build_object(
      'encounter_id', target_encounter_id,
      'diagnosis_id', resolved_diagnosis_id,
      'tooth_code', nullif(trim(target_tooth_code), ''),
      'type', diagnosis_type
    )
  );

  return new_encounter_diagnosis_id;
end;
$$;

create or replace function public.remove_encounter_diagnosis(
  org_id uuid,
  target_encounter_diagnosis_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_encounter_id uuid;
  target_diagnosis_id uuid;
  encounter_status text;
begin
  if not public.current_user_has_permission(org_id, 'clinical.write') then
    raise exception 'Clinical write permission required' using errcode = '42501';
  end if;

  select encounter_diagnosis.encounter_id, encounter_diagnosis.diagnosis_id, encounter.status
  into target_encounter_id, target_diagnosis_id, encounter_status
  from public.encounter_diagnoses encounter_diagnosis
  join public.clinical_encounters encounter
    on encounter.id = encounter_diagnosis.encounter_id
    and encounter.organization_id = encounter_diagnosis.organization_id
  where encounter_diagnosis.id = target_encounter_diagnosis_id
    and encounter_diagnosis.organization_id = org_id
  for update of encounter;

  if target_encounter_id is null then
    raise exception 'Encounter diagnosis not found';
  end if;
  if encounter_status <> 'open' then
    raise exception 'Diagnoses can only be changed during an open encounter';
  end if;

  delete from public.encounter_diagnoses
  where id = target_encounter_diagnosis_id and organization_id = org_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data
  ) values (
    org_id, auth.uid(), 'encounter_diagnosis.removed', 'encounter_diagnosis',
    target_encounter_diagnosis_id,
    jsonb_build_object(
      'encounter_id', target_encounter_id,
      'diagnosis_id', target_diagnosis_id
    )
  );
end;
$$;

create or replace function public.list_diagnosis_options(org_id uuid)
returns table (
  id uuid,
  code text,
  name text,
  system text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select diagnosis.id, diagnosis.code, diagnosis.name, diagnosis.system
  from public.diagnoses diagnosis
  where diagnosis.organization_id = org_id
    and diagnosis.is_active
    and public.current_user_has_permission(org_id, 'clinical.read')
  order by diagnosis.system, diagnosis.code, diagnosis.name
  limit 500;
$$;

create or replace function public.list_encounter_diagnoses(
  org_id uuid,
  target_encounter_id uuid
)
returns table (
  id uuid,
  diagnosis_id uuid,
  code text,
  name text,
  system text,
  tooth_code text,
  type text,
  notes text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    encounter_diagnosis.id,
    diagnosis.id,
    diagnosis.code,
    diagnosis.name,
    diagnosis.system,
    encounter_diagnosis.tooth_code,
    encounter_diagnosis.type,
    encounter_diagnosis.notes,
    encounter_diagnosis.created_at
  from public.encounter_diagnoses encounter_diagnosis
  join public.diagnoses diagnosis
    on diagnosis.id = encounter_diagnosis.diagnosis_id
    and diagnosis.organization_id = encounter_diagnosis.organization_id
  where encounter_diagnosis.organization_id = org_id
    and encounter_diagnosis.encounter_id = target_encounter_id
    and public.current_user_has_permission(org_id, 'clinical.read')
  order by
    case encounter_diagnosis.type
      when 'primary' then 1
      when 'secondary' then 2
      else 3
    end,
    encounter_diagnosis.created_at;
$$;

revoke all on function public.add_encounter_diagnosis(
  uuid, uuid, uuid, text, text, text, text, text, text
) from public;
revoke all on function public.remove_encounter_diagnosis(uuid, uuid) from public;
revoke all on function public.list_diagnosis_options(uuid) from public;
revoke all on function public.list_encounter_diagnoses(uuid, uuid) from public;

grant execute on function public.add_encounter_diagnosis(
  uuid, uuid, uuid, text, text, text, text, text, text
) to authenticated;
grant execute on function public.remove_encounter_diagnosis(uuid, uuid) to authenticated;
grant execute on function public.list_diagnosis_options(uuid) to authenticated;
grant execute on function public.list_encounter_diagnoses(uuid, uuid) to authenticated;
