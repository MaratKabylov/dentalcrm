insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'clinical-attachments',
  'clinical-attachments',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/tiff',
    'application/pdf'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_object_organization_id(object_name text)
returns uuid
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.storage_object_organization_id(text) from public;
grant execute on function public.storage_object_organization_id(text) to authenticated;

create policy clinical_attachments_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'clinical-attachments'
  and public.current_user_has_permission(
    public.storage_object_organization_id(name),
    'clinical.read'
  )
);

create policy clinical_attachments_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'clinical-attachments'
  and public.current_user_has_permission(
    public.storage_object_organization_id(name),
    'clinical.write'
  )
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  encounter_id uuid,
  treatment_plan_id uuid,
  entity_type text not null check (entity_type in ('patient', 'encounter', 'treatment_plan')),
  entity_id uuid not null,
  media_type text not null check (media_type in ('xray', 'photo', 'scan', 'ct', 'document', 'other')),
  storage_bucket text not null default 'clinical-attachments'
    check (storage_bucket = 'clinical-attachments'),
  storage_path text not null check (char_length(storage_path) between 10 and 1000),
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'image/heif', 'image/tiff', 'application/pdf'
  )),
  file_name text not null check (
    char_length(trim(file_name)) between 1 and 255
    and position('/' in file_name) = 0
    and position(E'\\' in file_name) = 0
  ),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  description text check (description is null or char_length(description) <= 1000),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  archive_reason text,
  constraint attachments_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint attachments_encounter_fkey foreign key (organization_id, encounter_id)
    references public.clinical_encounters(organization_id, id) on delete restrict,
  constraint attachments_treatment_plan_fkey foreign key (organization_id, treatment_plan_id)
    references public.treatment_plans(organization_id, id) on delete restrict,
  constraint attachments_entity_link_check check (
    (
      entity_type = 'patient'
      and entity_id = patient_id
      and encounter_id is null
      and treatment_plan_id is null
    )
    or (
      entity_type = 'encounter'
      and encounter_id is not null
      and entity_id = encounter_id
      and treatment_plan_id is null
    )
    or (
      entity_type = 'treatment_plan'
      and treatment_plan_id is not null
      and entity_id = treatment_plan_id
      and encounter_id is null
    )
  ),
  constraint attachments_archive_state_check check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or (
      archived_at is not null
      and archived_by is not null
      and archive_reason is not null
      and char_length(trim(archive_reason)) between 3 and 500
    )
  ),
  unique (organization_id, id),
  unique (storage_bucket, storage_path)
);

create index attachments_patient_created_idx
  on public.attachments (patient_id, created_at desc)
  where archived_at is null;
create index attachments_encounter_created_idx
  on public.attachments (encounter_id, created_at desc)
  where encounter_id is not null and archived_at is null;
create index attachments_treatment_plan_created_idx
  on public.attachments (treatment_plan_id, created_at desc)
  where treatment_plan_id is not null and archived_at is null;

alter table public.attachments enable row level security;

create or replace function public.attachment_storage_object_is_registered(
  target_bucket text,
  target_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.attachments attachment
    where attachment.storage_bucket = target_bucket
      and attachment.storage_path = target_path
  );
$$;

revoke all on function public.attachment_storage_object_is_registered(text, text) from public;
grant execute on function public.attachment_storage_object_is_registered(text, text) to authenticated;

create policy clinical_attachments_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'clinical-attachments'
  and public.current_user_has_permission(
    public.storage_object_organization_id(name),
    'clinical.write'
  )
  and not public.attachment_storage_object_is_registered(bucket_id, name)
);

create policy attachments_select on public.attachments
for select to authenticated
using (public.current_user_has_permission(organization_id, 'clinical.read'));

grant select on public.attachments to authenticated;

create or replace function public.register_attachment(
  org_id uuid,
  target_patient_id uuid,
  target_encounter_id uuid,
  target_treatment_plan_id uuid,
  attachment_entity_type text,
  attachment_entity_id uuid,
  attachment_media_type text,
  attachment_storage_path text,
  attachment_mime_type text,
  attachment_file_name text,
  attachment_size_bytes bigint,
  attachment_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  new_attachment_id uuid;
  normalized_file_name text;
  normalized_description text;
begin
  if not public.current_user_has_permission(org_id, 'clinical.write') then
    raise exception 'Clinical write permission required' using errcode = '42501';
  end if;

  normalized_file_name := nullif(trim(attachment_file_name), '');
  normalized_description := nullif(trim(attachment_description), '');

  if not exists (
    select 1 from public.patients patient
    where patient.id = target_patient_id
      and patient.organization_id = org_id
      and patient.archived_at is null
  ) then
    raise exception 'Active patient not found';
  end if;
  if attachment_media_type not in ('xray', 'photo', 'scan', 'ct', 'document', 'other') then
    raise exception 'Attachment media type is invalid';
  end if;
  if attachment_mime_type not in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'image/heif', 'image/tiff', 'application/pdf'
  ) then
    raise exception 'Attachment MIME type is not allowed';
  end if;
  if attachment_size_bytes is null or attachment_size_bytes not between 1 and 10485760 then
    raise exception 'Attachment size is invalid';
  end if;
  if normalized_file_name is null
    or char_length(normalized_file_name) > 255
    or position('/' in normalized_file_name) > 0
    or position(E'\\' in normalized_file_name) > 0
  then
    raise exception 'Attachment file name is invalid';
  end if;
  if normalized_description is not null and char_length(normalized_description) > 1000 then
    raise exception 'Attachment description is too long';
  end if;
  if attachment_storage_path not like org_id::text || '/' || target_patient_id::text || '/%' then
    raise exception 'Attachment storage path is outside the patient scope';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'clinical-attachments'
      and object.name = attachment_storage_path
  ) then
    raise exception 'Uploaded storage object not found';
  end if;

  if attachment_entity_type = 'patient' then
    if attachment_entity_id <> target_patient_id
      or target_encounter_id is not null
      or target_treatment_plan_id is not null
    then
      raise exception 'Patient attachment target is invalid';
    end if;
  elsif attachment_entity_type = 'encounter' then
    if target_encounter_id is null
      or attachment_entity_id <> target_encounter_id
      or target_treatment_plan_id is not null
      or not exists (
        select 1 from public.clinical_encounters encounter
        where encounter.id = target_encounter_id
          and encounter.organization_id = org_id
          and encounter.patient_id = target_patient_id
      )
    then
      raise exception 'Encounter attachment target is invalid';
    end if;
  elsif attachment_entity_type = 'treatment_plan' then
    if target_treatment_plan_id is null
      or attachment_entity_id <> target_treatment_plan_id
      or target_encounter_id is not null
      or not exists (
        select 1 from public.treatment_plans plan
        where plan.id = target_treatment_plan_id
          and plan.organization_id = org_id
          and plan.patient_id = target_patient_id
      )
    then
      raise exception 'Treatment plan attachment target is invalid';
    end if;
  else
    raise exception 'Attachment entity type is invalid';
  end if;

  insert into public.attachments (
    organization_id, patient_id, encounter_id, treatment_plan_id,
    entity_type, entity_id, media_type, storage_path, mime_type,
    file_name, size_bytes, description, uploaded_by
  ) values (
    org_id, target_patient_id, target_encounter_id, target_treatment_plan_id,
    attachment_entity_type, attachment_entity_id, attachment_media_type,
    attachment_storage_path, attachment_mime_type, normalized_file_name,
    attachment_size_bytes, normalized_description, auth.uid()
  ) returning id into new_attachment_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'attachment.created', 'attachment', new_attachment_id,
    jsonb_build_object(
      'patient_id', target_patient_id,
      'encounter_id', target_encounter_id,
      'treatment_plan_id', target_treatment_plan_id,
      'media_type', attachment_media_type,
      'mime_type', attachment_mime_type,
      'file_name', normalized_file_name,
      'size_bytes', attachment_size_bytes
    )
  );

  return new_attachment_id;
end;
$$;

create or replace function public.list_patient_attachments(
  org_id uuid,
  target_patient_id uuid,
  target_encounter_id uuid default null
)
returns table (
  id uuid,
  encounter_id uuid,
  treatment_plan_id uuid,
  entity_type text,
  media_type text,
  mime_type text,
  file_name text,
  size_bytes bigint,
  description text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    attachment.id,
    attachment.encounter_id,
    attachment.treatment_plan_id,
    attachment.entity_type,
    attachment.media_type,
    attachment.mime_type,
    attachment.file_name,
    attachment.size_bytes,
    attachment.description,
    attachment.created_at
  from public.attachments attachment
  where attachment.organization_id = org_id
    and attachment.patient_id = target_patient_id
    and attachment.archived_at is null
    and (target_encounter_id is null or attachment.encounter_id = target_encounter_id)
    and public.current_user_has_permission(org_id, 'clinical.read')
  order by attachment.created_at desc;
$$;

create or replace function public.get_attachment_storage_location(
  org_id uuid,
  target_attachment_id uuid
)
returns table (
  storage_bucket text,
  storage_path text,
  file_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select attachment.storage_bucket, attachment.storage_path, attachment.file_name
  from public.attachments attachment
  where attachment.organization_id = org_id
    and attachment.id = target_attachment_id
    and attachment.archived_at is null
    and public.current_user_has_permission(org_id, 'clinical.read');
$$;

create or replace function public.archive_attachment(
  org_id uuid,
  target_attachment_id uuid,
  archive_reason_text text
)
returns table (
  patient_id uuid,
  encounter_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_patient_id uuid;
  resolved_encounter_id uuid;
  previous_archived_at timestamptz;
begin
  if not public.current_user_has_permission(org_id, 'clinical.write') then
    raise exception 'Clinical write permission required' using errcode = '42501';
  end if;
  if archive_reason_text is null or char_length(trim(archive_reason_text)) not between 3 and 500 then
    raise exception 'Archive reason must contain between 3 and 500 characters';
  end if;

  select attachment.patient_id, attachment.encounter_id, attachment.archived_at
  into resolved_patient_id, resolved_encounter_id, previous_archived_at
  from public.attachments attachment
  where attachment.id = target_attachment_id
    and attachment.organization_id = org_id
  for update;

  if resolved_patient_id is null then
    raise exception 'Attachment not found';
  end if;
  if previous_archived_at is not null then
    raise exception 'Attachment is already archived';
  end if;

  update public.attachments
  set archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = trim(archive_reason_text)
  where id = target_attachment_id and organization_id = org_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'attachment.archived', 'attachment', target_attachment_id,
    jsonb_build_object(
      'patient_id', resolved_patient_id,
      'encounter_id', resolved_encounter_id,
      'archive_reason', trim(archive_reason_text)
    )
  );

  return query select resolved_patient_id, resolved_encounter_id;
end;
$$;

revoke all on function public.register_attachment(
  uuid, uuid, uuid, uuid, text, uuid, text, text, text, text, bigint, text
) from public;
revoke all on function public.list_patient_attachments(uuid, uuid, uuid) from public;
revoke all on function public.get_attachment_storage_location(uuid, uuid) from public;
revoke all on function public.archive_attachment(uuid, uuid, text) from public;

grant execute on function public.register_attachment(
  uuid, uuid, uuid, uuid, text, uuid, text, text, text, text, bigint, text
) to authenticated;
grant execute on function public.list_patient_attachments(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_attachment_storage_location(uuid, uuid) to authenticated;
grant execute on function public.archive_attachment(uuid, uuid, text) to authenticated;
