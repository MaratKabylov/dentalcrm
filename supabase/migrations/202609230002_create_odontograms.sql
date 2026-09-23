create table public.odontograms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  encounter_id uuid,
  version_no integer not null check (version_no > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint odontograms_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint odontograms_encounter_fkey foreign key (organization_id, encounter_id)
    references public.clinical_encounters(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, patient_id, version_no)
);

create table public.odontogram_teeth (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  odontogram_id uuid not null,
  tooth_code text not null,
  tooth_state text not null,
  notes text,
  constraint odontogram_teeth_odontogram_fkey foreign key (organization_id, odontogram_id)
    references public.odontograms(organization_id, id) on delete cascade,
  constraint odontogram_teeth_code_check check (tooth_code = any(array[
    '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
    '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38',
    '55','54','53','52','51','61','62','63','64','65',
    '85','84','83','82','81','71','72','73','74','75'
  ])),
  constraint odontogram_teeth_state_check check (tooth_state = any(array[
    'healthy','caries','filling','crown','missing','implant','root','fracture',
    'mobility','extraction_planned','endodontic','temporary_filling','veneer',
    'bridge_part','other'
  ])),
  constraint odontogram_teeth_notes_length check (
    notes is null or char_length(notes) <= 1000
  ),
  unique (organization_id, id),
  unique (odontogram_id, tooth_code)
);

create table public.odontogram_surfaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  odontogram_tooth_id uuid not null,
  surface text not null check (surface in ('M', 'D', 'O', 'V', 'L', 'I')),
  condition_code text not null check (condition_code = any(array[
    'healthy','caries','filling','crown','missing','implant','root','fracture',
    'mobility','extraction_planned','endodontic','temporary_filling','veneer',
    'bridge_part','other'
  ])),
  constraint odontogram_surfaces_tooth_fkey foreign key (organization_id, odontogram_tooth_id)
    references public.odontogram_teeth(organization_id, id) on delete cascade,
  unique (odontogram_tooth_id, surface)
);

create index odontograms_patient_version_idx
  on public.odontograms (patient_id, version_no desc);
create index odontograms_encounter_idx
  on public.odontograms (encounter_id) where encounter_id is not null;
create index odontogram_teeth_odontogram_idx on public.odontogram_teeth (odontogram_id);
create index odontogram_surfaces_tooth_idx on public.odontogram_surfaces (odontogram_tooth_id);

alter table public.odontograms enable row level security;
alter table public.odontogram_teeth enable row level security;
alter table public.odontogram_surfaces enable row level security;

create policy odontograms_select on public.odontograms
for select to authenticated
using (public.current_user_has_permission(organization_id, 'clinical.read'));
create policy odontogram_teeth_select on public.odontogram_teeth
for select to authenticated
using (public.current_user_has_permission(organization_id, 'clinical.read'));
create policy odontogram_surfaces_select on public.odontogram_surfaces
for select to authenticated
using (public.current_user_has_permission(organization_id, 'clinical.read'));

grant select on public.odontograms, public.odontogram_teeth,
  public.odontogram_surfaces to authenticated;

create or replace function public.save_odontogram(
  org_id uuid,
  target_patient_id uuid,
  target_encounter_id uuid,
  teeth_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed_tooth_codes constant text[] := array[
    '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
    '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38',
    '55','54','53','52','51','61','62','63','64','65',
    '85','84','83','82','81','71','72','73','74','75'
  ];
  allowed_conditions constant text[] := array[
    'healthy','caries','filling','crown','missing','implant','root','fracture',
    'mobility','extraction_planned','endodontic','temporary_filling','veneer',
    'bridge_part','other'
  ];
  new_odontogram_id uuid;
  new_tooth_id uuid;
  new_version integer;
  encounter_status text;
  tooth_item jsonb;
  surface_item jsonb;
  tooth_code_value text;
  tooth_state_value text;
  tooth_notes_value text;
  surface_value text;
  condition_value text;
  item_count integer;
  distinct_code_count integer;
begin
  if not public.current_user_has_permission(org_id, 'clinical.write') then
    raise exception 'Clinical write permission required' using errcode = '42501';
  end if;

  perform 1
  from public.patients patient
  where patient.id = target_patient_id
    and patient.organization_id = org_id
    and patient.archived_at is null
  for update;
  if not found then
    raise exception 'Active patient not found';
  end if;

  select encounter.status into encounter_status
  from public.clinical_encounters encounter
  where encounter.id = target_encounter_id
    and encounter.organization_id = org_id
    and encounter.patient_id = target_patient_id;
  if encounter_status is null then
    raise exception 'Clinical encounter not found';
  end if;
  if encounter_status <> 'open' then
    raise exception 'Odontogram can only be changed during an open encounter';
  end if;

  if teeth_payload is null or jsonb_typeof(teeth_payload) <> 'array' then
    raise exception 'Odontogram payload must be an array';
  end if;

  select count(*), count(distinct item->>'toothCode')
  into item_count, distinct_code_count
  from jsonb_array_elements(teeth_payload) item;
  if item_count <> 52 or distinct_code_count <> 52 then
    raise exception 'Odontogram must contain all 52 unique FDI tooth codes';
  end if;

  select coalesce(max(odontogram.version_no), 0) + 1
  into new_version
  from public.odontograms odontogram
  where odontogram.organization_id = org_id
    and odontogram.patient_id = target_patient_id;

  insert into public.odontograms (
    organization_id, patient_id, encounter_id, version_no, created_by
  ) values (
    org_id, target_patient_id, target_encounter_id, new_version, auth.uid()
  ) returning id into new_odontogram_id;

  for tooth_item in select value from jsonb_array_elements(teeth_payload)
  loop
    tooth_code_value := tooth_item->>'toothCode';
    tooth_state_value := tooth_item->>'state';
    tooth_notes_value := tooth_item->>'notes';

    if tooth_code_value is null or not (tooth_code_value = any(allowed_tooth_codes)) then
      raise exception 'Invalid FDI tooth code';
    end if;
    if tooth_state_value is null or not (tooth_state_value = any(allowed_conditions)) then
      raise exception 'Invalid tooth condition';
    end if;
    if tooth_notes_value is not null and char_length(trim(tooth_notes_value)) > 1000 then
      raise exception 'Tooth notes are too long';
    end if;
    if jsonb_typeof(coalesce(tooth_item->'surfaces', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(tooth_item->'surfaces', '[]'::jsonb)) > 6
    then
      raise exception 'Invalid tooth surfaces';
    end if;

    insert into public.odontogram_teeth (
      organization_id, odontogram_id, tooth_code, tooth_state, notes
    ) values (
      org_id, new_odontogram_id, tooth_code_value, tooth_state_value,
      nullif(trim(tooth_notes_value), '')
    ) returning id into new_tooth_id;

    for surface_item in
      select value from jsonb_array_elements(coalesce(tooth_item->'surfaces', '[]'::jsonb))
    loop
      surface_value := surface_item->>'surface';
      condition_value := surface_item->>'condition';
      if surface_value is null or surface_value not in ('M', 'D', 'O', 'V', 'L', 'I') then
        raise exception 'Invalid tooth surface';
      end if;
      if condition_value is null or not (condition_value = any(allowed_conditions)) then
        raise exception 'Invalid surface condition';
      end if;

      insert into public.odontogram_surfaces (
        organization_id, odontogram_tooth_id, surface, condition_code
      ) values (
        org_id, new_tooth_id, surface_value, condition_value
      );
    end loop;
  end loop;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'odontogram.created', 'odontogram', new_odontogram_id,
    jsonb_build_object(
      'patient_id', target_patient_id,
      'encounter_id', target_encounter_id,
      'version_no', new_version,
      'tooth_count', item_count
    )
  );

  return new_odontogram_id;
end;
$$;

create or replace function public.get_latest_odontogram(
  org_id uuid,
  target_patient_id uuid
)
returns table (
  odontogram_id uuid,
  version_no integer,
  encounter_id uuid,
  created_at timestamptz,
  tooth_code text,
  tooth_state text,
  tooth_notes text,
  surface text,
  condition_code text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with latest as (
    select odontogram.id, odontogram.version_no, odontogram.encounter_id, odontogram.created_at
    from public.odontograms odontogram
    where odontogram.organization_id = org_id
      and odontogram.patient_id = target_patient_id
      and public.current_user_has_permission(org_id, 'clinical.read')
    order by odontogram.version_no desc
    limit 1
  )
  select
    latest.id,
    latest.version_no,
    latest.encounter_id,
    latest.created_at,
    tooth.tooth_code,
    tooth.tooth_state,
    tooth.notes,
    surface.surface,
    surface.condition_code
  from latest
  join public.odontogram_teeth tooth
    on tooth.odontogram_id = latest.id and tooth.organization_id = org_id
  left join public.odontogram_surfaces surface
    on surface.odontogram_tooth_id = tooth.id and surface.organization_id = org_id
  order by tooth.tooth_code, surface.surface;
$$;

revoke all on function public.save_odontogram(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.get_latest_odontogram(uuid, uuid) from public;
grant execute on function public.save_odontogram(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.get_latest_odontogram(uuid, uuid) to authenticated;
