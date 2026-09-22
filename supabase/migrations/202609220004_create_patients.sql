create extension if not exists pg_trgm with schema extensions;

alter table public.branches
  add constraint branches_organization_id_id_key unique (organization_id, id);

create table public.patient_number_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0)
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  external_number text not null,
  iin text,
  last_name text not null check (char_length(trim(last_name)) between 1 and 100),
  first_name text not null check (char_length(trim(first_name)) between 1 and 100),
  middle_name text check (middle_name is null or char_length(trim(middle_name)) between 1 and 100),
  birth_date date check (birth_date is null or birth_date <= current_date),
  gender text check (gender is null or gender in ('male', 'female')),
  phone text not null check (char_length(trim(phone)) between 5 and 30),
  phone_normalized text not null,
  email text,
  address text,
  city text,
  notes text,
  primary_branch_id uuid,
  consent_personal_data boolean not null default false,
  consent_marketing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint patients_iin_format check (iin is null or iin ~ '^[0-9]{12}$'),
  constraint patients_organization_branch_fkey foreign key (organization_id, primary_branch_id)
    references public.branches(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, external_number)
);

create unique index patients_organization_iin_idx
  on public.patients (organization_id, iin) where iin is not null;
create index patients_organization_id_idx on public.patients (organization_id);
create index patients_organization_phone_idx
  on public.patients (organization_id, phone_normalized);
create index patients_name_trgm_idx on public.patients using gin (
  (lower(last_name || ' ' || first_name || ' ' || coalesce(middle_name, '')))
  extensions.gin_trgm_ops
);

create table public.patient_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  type text not null check (type in ('phone', 'email', 'telegram', 'whatsapp', 'other')),
  value text not null check (char_length(trim(value)) between 1 and 200),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint patient_contacts_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade
);

create table public.patient_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 50),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.patient_tag_assignments (
  organization_id uuid not null,
  patient_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (patient_id, tag_id),
  constraint patient_tag_assignments_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade,
  constraint patient_tag_assignments_tag_fkey foreign key (organization_id, tag_id)
    references public.patient_tags(organization_id, id) on delete cascade
);

create table public.patient_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  author_user_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  constraint patient_notes_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade
);

create index patient_contacts_patient_id_idx on public.patient_contacts (patient_id);
create index patient_tags_organization_id_idx on public.patient_tags (organization_id);
create index patient_tag_assignments_tag_id_idx on public.patient_tag_assignments (tag_id);
create index patient_notes_patient_time_idx on public.patient_notes (patient_id, created_at desc);

create or replace function public.normalize_phone(value text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select regexp_replace(value, '[^0-9]+', '', 'g');
$$;

create or replace function public.set_patient_normalized_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.last_name = trim(new.last_name);
  new.first_name = trim(new.first_name);
  new.middle_name = nullif(trim(new.middle_name), '');
  new.iin = nullif(trim(new.iin), '');
  new.phone = trim(new.phone);
  new.phone_normalized = public.normalize_phone(new.phone);
  new.email = nullif(lower(trim(new.email)), '');
  return new;
end;
$$;

create trigger patients_normalize_fields
before insert or update of last_name, first_name, middle_name, iin, phone, email
on public.patients for each row execute function public.set_patient_normalized_fields();

create trigger patients_set_updated_at before update on public.patients
for each row execute function public.set_updated_at();

create or replace function public.audit_patient_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    new.organization_id,
    auth.uid(),
    case when tg_op = 'INSERT' then 'patient.created' else 'patient.updated' end,
    'patient',
    new.id,
    case when tg_op = 'UPDATE' then jsonb_build_object(
      'external_number', old.external_number,
      'last_name', old.last_name,
      'first_name', old.first_name,
      'archived_at', old.archived_at
    ) end,
    jsonb_build_object(
      'external_number', new.external_number,
      'last_name', new.last_name,
      'first_name', new.first_name,
      'archived_at', new.archived_at
    )
  );
  return new;
end;
$$;

create trigger patients_audit_change
after insert or update on public.patients
for each row execute function public.audit_patient_change();

alter table public.patient_number_counters enable row level security;
alter table public.patients enable row level security;
alter table public.patient_contacts enable row level security;
alter table public.patient_tags enable row level security;
alter table public.patient_tag_assignments enable row level security;
alter table public.patient_notes enable row level security;

create policy patients_select on public.patients
for select to authenticated
using (public.current_user_has_permission(organization_id, 'patients.read'));

create policy patients_insert on public.patients
for insert to authenticated
with check (public.current_user_has_permission(organization_id, 'patients.create'));

create policy patients_update on public.patients
for update to authenticated
using (public.current_user_has_permission(organization_id, 'patients.update'))
with check (public.current_user_has_permission(organization_id, 'patients.update'));

create policy patient_contacts_select on public.patient_contacts
for select to authenticated
using (public.current_user_has_permission(organization_id, 'patients.read'));
create policy patient_contacts_insert on public.patient_contacts
for insert to authenticated
with check (public.current_user_has_permission(organization_id, 'patients.update'));
create policy patient_contacts_update on public.patient_contacts
for update to authenticated
using (public.current_user_has_permission(organization_id, 'patients.update'))
with check (public.current_user_has_permission(organization_id, 'patients.update'));
create policy patient_contacts_delete on public.patient_contacts
for delete to authenticated
using (public.current_user_has_permission(organization_id, 'patients.update'));

create policy patient_tags_select on public.patient_tags
for select to authenticated
using (public.current_user_has_permission(organization_id, 'patients.read'));
create policy patient_tags_insert on public.patient_tags
for insert to authenticated
with check (public.current_user_has_permission(organization_id, 'patients.update'));
create policy patient_tags_update on public.patient_tags
for update to authenticated
using (public.current_user_has_permission(organization_id, 'patients.update'))
with check (public.current_user_has_permission(organization_id, 'patients.update'));
create policy patient_tags_delete on public.patient_tags
for delete to authenticated
using (public.current_user_has_permission(organization_id, 'patients.update'));

create policy patient_tag_assignments_select on public.patient_tag_assignments
for select to authenticated
using (public.current_user_has_permission(organization_id, 'patients.read'));
create policy patient_tag_assignments_insert on public.patient_tag_assignments
for insert to authenticated
with check (public.current_user_has_permission(organization_id, 'patients.update'));
create policy patient_tag_assignments_delete on public.patient_tag_assignments
for delete to authenticated
using (public.current_user_has_permission(organization_id, 'patients.update'));

create policy patient_notes_select on public.patient_notes
for select to authenticated
using (public.current_user_has_permission(organization_id, 'patients.read'));
create policy patient_notes_insert on public.patient_notes
for insert to authenticated
with check (
  author_user_id = auth.uid()
  and public.current_user_has_permission(organization_id, 'patients.update')
);

grant select on public.patients to authenticated;
grant select, insert, update, delete on public.patient_contacts, public.patient_tags,
  public.patient_tag_assignments to authenticated;
grant select, insert on public.patient_notes to authenticated;

create or replace function public.create_patient(
  org_id uuid,
  patient_last_name text,
  patient_first_name text,
  patient_middle_name text default null,
  patient_birth_date date default null,
  patient_gender text default null,
  patient_phone text default '',
  patient_iin text default null,
  patient_email text default null,
  patient_primary_branch_id uuid default null,
  patient_consent_personal_data boolean default false,
  patient_consent_marketing boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_patient_id uuid;
  next_number bigint;
begin
  if not public.current_user_has_permission(org_id, 'patients.create') then
    raise exception 'Patient create permission required' using errcode = '42501';
  end if;

  insert into public.patient_number_counters (organization_id, last_value)
  values (org_id, 1)
  on conflict (organization_id) do update
    set last_value = public.patient_number_counters.last_value + 1
  returning last_value into next_number;

  insert into public.patients (
    organization_id, external_number, last_name, first_name, middle_name,
    birth_date, gender, phone, phone_normalized, iin, email, primary_branch_id,
    consent_personal_data, consent_marketing
  ) values (
    org_id, lpad(next_number::text, 6, '0'), patient_last_name, patient_first_name,
    patient_middle_name, patient_birth_date, patient_gender, patient_phone,
    public.normalize_phone(patient_phone), patient_iin, patient_email,
    patient_primary_branch_id, patient_consent_personal_data, patient_consent_marketing
  ) returning id into new_patient_id;

  return new_patient_id;
end;
$$;

create or replace function public.search_patients(
  org_id uuid,
  search_text text default '',
  result_limit integer default 50
)
returns table (
  id uuid,
  external_number text,
  last_name text,
  first_name text,
  middle_name text,
  birth_date date,
  phone text,
  phone_normalized text,
  iin text,
  archived_at timestamptz
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    patient.id,
    patient.external_number,
    patient.last_name,
    patient.first_name,
    patient.middle_name,
    patient.birth_date,
    patient.phone,
    patient.phone_normalized,
    patient.iin,
    patient.archived_at
  from public.patients patient
  where patient.organization_id = org_id
    and patient.archived_at is null
    and public.current_user_has_permission(org_id, 'patients.read')
    and (
      nullif(trim(search_text), '') is null
      or patient.iin = regexp_replace(search_text, '[^0-9]+', '', 'g')
      or (
        public.normalize_phone(search_text) <> ''
        and patient.phone_normalized like '%' || public.normalize_phone(search_text) || '%'
      )
      or patient.external_number ilike '%' || trim(search_text) || '%'
      or lower(patient.last_name || ' ' || patient.first_name || ' ' || coalesce(patient.middle_name, ''))
        % lower(trim(search_text))
      or lower(patient.last_name || ' ' || patient.first_name || ' ' || coalesce(patient.middle_name, ''))
        like '%' || lower(trim(search_text)) || '%'
    )
  order by patient.last_name, patient.first_name, patient.created_at desc
  limit least(greatest(result_limit, 1), 100);
$$;

revoke all on function public.normalize_phone(text) from public;
revoke all on function public.create_patient(
  uuid, text, text, text, date, text, text, text, text, uuid, boolean, boolean
) from public;
revoke all on function public.search_patients(uuid, text, integer) from public;
grant execute on function public.normalize_phone(text) to authenticated;
grant execute on function public.create_patient(
  uuid, text, text, text, date, text, text, text, text, uuid, boolean, boolean
) to authenticated;
grant execute on function public.search_patients(uuid, text, integer) to authenticated;
