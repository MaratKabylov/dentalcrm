begin;

insert into public.permissions (code, description) values
  ('documents.read', 'Просмотр документов и согласий пациентов'),
  ('documents.manage', 'Создание и подписание документов пациентов')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = any(array['documents.read', 'documents.manage'])
where role.organization_id is null
  and role.code = any(array['owner', 'administrator', 'receptionist', 'doctor'])
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'documents.read'
where role.organization_id is null
  and role.code = any(array['assistant', 'auditor'])
on conflict do nothing;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'patient-documents',
  'patient-documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  document_type text not null check (document_type in (
    'informed_consent', 'treatment_agreement', 'treatment_plan', 'act',
    'recommendations', 'certificate', 'prescription', 'custom'
  )),
  consent_type text check (consent_type is null or consent_type in (
    'personal_data', 'medical_treatment', 'marketing', 'photo', 'communication'
  )),
  title_template text not null check (char_length(trim(title_template)) between 2 and 240),
  body_template text not null check (char_length(trim(body_template)) between 10 and 50000),
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create index document_templates_type_idx
  on public.document_templates (organization_id, document_type, is_active, name);

create trigger document_templates_set_updated_at
before update on public.document_templates
for each row execute function public.set_updated_at();

create table public.generated_documents (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  encounter_id uuid,
  template_id uuid,
  document_type text not null check (document_type in (
    'informed_consent', 'treatment_agreement', 'treatment_plan', 'act',
    'recommendations', 'certificate', 'prescription', 'custom'
  )),
  consent_type text check (consent_type is null or consent_type in (
    'personal_data', 'medical_treatment', 'marketing', 'photo', 'communication'
  )),
  document_number text not null check (char_length(document_number) between 8 and 40),
  status text not null default 'finalized' check (status in ('finalized', 'signed')),
  title text not null check (char_length(trim(title)) between 2 and 240),
  rendered_body text not null check (char_length(trim(rendered_body)) between 10 and 50000),
  rendered_data jsonb not null default '{}'::jsonb,
  template_version integer check (template_version is null or template_version > 0),
  storage_bucket text not null default 'patient-documents' check (storage_bucket = 'patient-documents'),
  pdf_storage_path text not null check (char_length(pdf_storage_path) between 10 and 1000),
  pdf_size_bytes bigint not null check (pdf_size_bytes between 1 and 10485760),
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz,
  signed_by_patient boolean not null default false,
  signed_by_name text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint generated_documents_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint generated_documents_encounter_fkey foreign key (organization_id, encounter_id)
    references public.clinical_encounters(organization_id, id) on delete restrict,
  constraint generated_documents_template_fkey foreign key (organization_id, template_id)
    references public.document_templates(organization_id, id) on delete restrict,
  constraint generated_documents_signature_check check (
    (status = 'finalized' and signed_at is null and signed_by_patient = false and signed_by_name is null)
    or (
      status = 'signed' and signed_at is not null and signed_by_patient = true
      and signed_by_name is not null and char_length(trim(signed_by_name)) between 2 and 200
    )
  ),
  unique (organization_id, id),
  unique (organization_id, document_number),
  unique (storage_bucket, pdf_storage_path)
);

create index generated_documents_patient_idx
  on public.generated_documents (organization_id, patient_id, created_at desc);
create index generated_documents_encounter_idx
  on public.generated_documents (organization_id, encounter_id, created_at desc)
  where encounter_id is not null;

create table public.patient_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  consent_type text not null check (consent_type in (
    'personal_data', 'medical_treatment', 'marketing', 'photo', 'communication'
  )),
  version integer not null check (version > 0),
  status text not null check (status in ('granted', 'revoked')),
  granted_at timestamptz not null,
  revoked_at timestamptz,
  document_id uuid not null,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  revoked_by uuid references public.profiles(id) on delete restrict,
  revocation_reason text,
  created_at timestamptz not null default now(),
  constraint patient_consents_patient_fkey foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint patient_consents_document_fkey foreign key (organization_id, document_id)
    references public.generated_documents(organization_id, id) on delete restrict,
  constraint patient_consents_revocation_check check (
    (status = 'granted' and revoked_at is null and revoked_by is null and revocation_reason is null)
    or (
      status = 'revoked' and revoked_at is not null and revoked_by is not null
      and revocation_reason is not null and char_length(trim(revocation_reason)) between 3 and 500
    )
  ),
  unique (organization_id, id),
  unique (organization_id, patient_id, consent_type, version),
  unique (organization_id, document_id)
);

create unique index patient_consents_active_type_idx
  on public.patient_consents (organization_id, patient_id, consent_type)
  where status = 'granted';
create index patient_consents_patient_idx
  on public.patient_consents (organization_id, patient_id, granted_at desc);

alter table public.document_templates enable row level security;
alter table public.generated_documents enable row level security;
alter table public.patient_consents enable row level security;

create policy document_templates_select on public.document_templates
for select to authenticated
using (public.current_user_has_permission(organization_id, 'documents.read'));

create policy generated_documents_select on public.generated_documents
for select to authenticated
using (public.current_user_has_permission(organization_id, 'documents.read'));

create policy patient_consents_select on public.patient_consents
for select to authenticated
using (public.current_user_has_permission(organization_id, 'documents.read'));

grant select on public.document_templates, public.generated_documents, public.patient_consents to authenticated;

create policy patient_documents_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'patient-documents'
  and public.current_user_has_permission(
    public.storage_object_organization_id(name),
    'documents.read'
  )
);

create policy patient_documents_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'patient-documents'
  and public.current_user_has_permission(
    public.storage_object_organization_id(name),
    'documents.manage'
  )
);

create or replace function public.patient_document_storage_object_is_registered(
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
    select 1 from public.generated_documents document
    where document.storage_bucket = target_bucket
      and document.pdf_storage_path = target_path
  );
$$;

revoke all on function public.patient_document_storage_object_is_registered(text, text) from public;
grant execute on function public.patient_document_storage_object_is_registered(text, text) to authenticated;

create policy patient_documents_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'patient-documents'
  and public.current_user_has_permission(
    public.storage_object_organization_id(name),
    'documents.manage'
  )
  and not public.patient_document_storage_object_is_registered(bucket_id, name)
);

create or replace function public.seed_default_document_templates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.document_templates (
    organization_id, name, document_type, consent_type, title_template, body_template
  ) values
    (
      new.id,
      'Информированное согласие на лечение',
      'informed_consent',
      'medical_treatment',
      'Информированное согласие пациента',
      E'Я, {{patient_full_name}}, ИИН {{patient_iin}}, подтверждаю, что получил(а) понятную информацию о предлагаемом стоматологическом лечении, его целях, возможных рисках, альтернативных методах и последствиях отказа.\n\nЯ имел(а) возможность задать вопросы и получил(а) на них ответы. Добровольно соглашаюсь на проведение лечения в {{organization_name}}.\n\nДата: {{document_date}}\nНомер документа: {{document_number}}'
    ),
    (
      new.id,
      'Согласие на обработку персональных данных',
      'informed_consent',
      'personal_data',
      'Согласие на обработку персональных данных',
      E'Я, {{patient_full_name}}, ИИН {{patient_iin}}, даю {{organization_name}} согласие на сбор, обработку и хранение моих персональных данных в объёме, необходимом для оказания медицинских услуг и ведения медицинской документации.\n\nДата: {{document_date}}\nНомер документа: {{document_number}}'
    ),
    (
      new.id,
      'Рекомендации пациенту',
      'recommendations',
      null,
      'Рекомендации пациенту',
      E'Пациент: {{patient_full_name}}\nДата: {{document_date}}\n\nРекомендации:\n\n1. Соблюдайте рекомендации лечащего врача.\n2. При усилении боли, отёка или повышении температуры обратитесь в клинику.\n3. Следующий визит согласуйте с регистратурой {{organization_name}}.\n\nТелефон пациента: {{patient_phone}}'
    )
  on conflict (organization_id, name) do nothing;
  return new;
end;
$$;

create trigger organizations_seed_document_templates
after insert on public.organizations
for each row execute function public.seed_default_document_templates();

insert into public.document_templates (
  organization_id, name, document_type, consent_type, title_template, body_template
)
select organization.id, template.name, template.document_type, template.consent_type,
  template.title_template, template.body_template
from public.organizations organization
cross join (values
  (
    'Информированное согласие на лечение',
    'informed_consent',
    'medical_treatment',
    'Информированное согласие пациента',
    E'Я, {{patient_full_name}}, ИИН {{patient_iin}}, подтверждаю, что получил(а) понятную информацию о предлагаемом стоматологическом лечении, его целях, возможных рисках, альтернативных методах и последствиях отказа.\n\nЯ имел(а) возможность задать вопросы и получил(а) на них ответы. Добровольно соглашаюсь на проведение лечения в {{organization_name}}.\n\nДата: {{document_date}}\nНомер документа: {{document_number}}'
  ),
  (
    'Согласие на обработку персональных данных',
    'informed_consent',
    'personal_data',
    'Согласие на обработку персональных данных',
    E'Я, {{patient_full_name}}, ИИН {{patient_iin}}, даю {{organization_name}} согласие на сбор, обработку и хранение моих персональных данных в объёме, необходимом для оказания медицинских услуг и ведения медицинской документации.\n\nДата: {{document_date}}\nНомер документа: {{document_number}}'
  ),
  (
    'Рекомендации пациенту',
    'recommendations',
    null,
    'Рекомендации пациенту',
    E'Пациент: {{patient_full_name}}\nДата: {{document_date}}\n\nРекомендации:\n\n1. Соблюдайте рекомендации лечащего врача.\n2. При усилении боли, отёка или повышении температуры обратитесь в клинику.\n3. Следующий визит согласуйте с регистратурой {{organization_name}}.\n\nТелефон пациента: {{patient_phone}}'
  )
) as template(name, document_type, consent_type, title_template, body_template)
on conflict (organization_id, name) do nothing;

create or replace function public.save_document_template(
  org_id uuid,
  target_template_id uuid,
  template_name text,
  template_document_type text,
  template_consent_type text,
  template_title text,
  template_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_template_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'documents.manage') then
    raise exception 'Document manage permission required' using errcode = '42501';
  end if;
  if template_document_type not in (
    'informed_consent', 'treatment_agreement', 'treatment_plan', 'act',
    'recommendations', 'certificate', 'prescription', 'custom'
  ) then raise exception 'Document type is invalid'; end if;
  if template_consent_type is not null and template_consent_type not in (
    'personal_data', 'medical_treatment', 'marketing', 'photo', 'communication'
  ) then raise exception 'Consent type is invalid'; end if;
  if template_name is null or char_length(trim(template_name)) not between 2 and 160
    or template_title is null or char_length(trim(template_title)) not between 2 and 240
    or template_body is null or char_length(trim(template_body)) not between 10 and 50000
  then raise exception 'Document template content is invalid'; end if;

  if target_template_id is null then
    insert into public.document_templates (
      organization_id, name, document_type, consent_type, title_template, body_template, created_by
    ) values (
      org_id, trim(template_name), template_document_type, template_consent_type,
      trim(template_title), trim(template_body), auth.uid()
    ) returning id into saved_template_id;
  else
    update public.document_templates
    set name = trim(template_name),
        document_type = template_document_type,
        consent_type = template_consent_type,
        title_template = trim(template_title),
        body_template = trim(template_body),
        version = version + 1
    where organization_id = org_id and id = target_template_id
    returning id into saved_template_id;
    if saved_template_id is null then raise exception 'Document template not found'; end if;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(),
    case when target_template_id is null then 'document_template.created' else 'document_template.updated' end,
    'document_template', saved_template_id,
    jsonb_build_object('document_type', template_document_type, 'consent_type', template_consent_type)
  );
  return saved_template_id;
end;
$$;

create or replace function public.set_document_template_active(
  org_id uuid,
  target_template_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'documents.manage') then
    raise exception 'Document manage permission required' using errcode = '42501';
  end if;
  update public.document_templates set is_active = target_is_active
  where organization_id = org_id and id = target_template_id;
  if not found then raise exception 'Document template not found'; end if;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'document_template.activity_changed', 'document_template', target_template_id,
    jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

create or replace function public.register_generated_document(
  org_id uuid,
  target_document_id uuid,
  target_patient_id uuid,
  target_encounter_id uuid,
  source_template_id uuid,
  generated_document_type text,
  generated_consent_type text,
  generated_document_number text,
  generated_title text,
  generated_body text,
  generated_data jsonb,
  source_template_version integer,
  generated_pdf_storage_path text,
  generated_pdf_size_bytes bigint,
  generated_pdf_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_permission(org_id, 'documents.manage') then
    raise exception 'Document manage permission required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.patients patient
    where patient.organization_id = org_id and patient.id = target_patient_id and patient.archived_at is null
  ) then raise exception 'Patient not found'; end if;
  if target_encounter_id is not null and not exists (
    select 1 from public.clinical_encounters encounter
    where encounter.organization_id = org_id and encounter.id = target_encounter_id
      and encounter.patient_id = target_patient_id
  ) then raise exception 'Patient encounter not found'; end if;
  if source_template_id is not null and not exists (
    select 1 from public.document_templates template
    where template.organization_id = org_id and template.id = source_template_id
      and template.document_type = generated_document_type
      and template.consent_type is not distinct from generated_consent_type
      and template.version = source_template_version
  ) then raise exception 'Document template version does not match'; end if;
  if generated_pdf_storage_path <> org_id::text || '/' || target_patient_id::text || '/' || target_document_id::text || '/generated.pdf' then
    raise exception 'Document storage path is outside the patient scope';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'patient-documents' and object.name = generated_pdf_storage_path
  ) then raise exception 'Generated PDF storage object not found'; end if;

  insert into public.generated_documents (
    id, organization_id, patient_id, encounter_id, template_id,
    document_type, consent_type, document_number, status, title,
    rendered_body, rendered_data, template_version, pdf_storage_path,
    pdf_size_bytes, pdf_sha256, created_by
  ) values (
    target_document_id, org_id, target_patient_id, target_encounter_id, source_template_id,
    generated_document_type, generated_consent_type, generated_document_number, 'finalized', trim(generated_title),
    trim(generated_body), coalesce(generated_data, '{}'::jsonb), source_template_version,
    generated_pdf_storage_path, generated_pdf_size_bytes, generated_pdf_sha256, auth.uid()
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'generated_document.created', 'generated_document', target_document_id,
    jsonb_build_object(
      'patient_id', target_patient_id, 'document_type', generated_document_type,
      'template_id', source_template_id, 'template_version', source_template_version,
      'pdf_sha256', generated_pdf_sha256
    )
  );
  return target_document_id;
end;
$$;

create or replace function public.sign_generated_document(
  org_id uuid,
  target_document_id uuid,
  signer_name text,
  signed_pdf_storage_path text,
  signed_pdf_size_bytes bigint,
  signed_pdf_sha256 text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  document_patient_id uuid;
  document_consent_type text;
  document_template_version integer;
  next_consent_version integer;
begin
  if not public.current_user_has_permission(org_id, 'documents.manage') then
    raise exception 'Document manage permission required' using errcode = '42501';
  end if;
  if signer_name is null or char_length(trim(signer_name)) not between 2 and 200 then
    raise exception 'Signer name is invalid';
  end if;

  select document.patient_id, document.consent_type, document.template_version
  into document_patient_id, document_consent_type, document_template_version
  from public.generated_documents document
  where document.organization_id = org_id and document.id = target_document_id
  for update;
  if document_patient_id is null then raise exception 'Generated document not found'; end if;
  if exists (
    select 1 from public.generated_documents document
    where document.organization_id = org_id and document.id = target_document_id and document.status = 'signed'
  ) then raise exception 'Document is already signed'; end if;
  if signed_pdf_storage_path <> org_id::text || '/' || document_patient_id::text || '/' || target_document_id::text || '/signed.pdf' then
    raise exception 'Signed document storage path is outside the patient scope';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'patient-documents' and object.name = signed_pdf_storage_path
  ) then raise exception 'Signed PDF storage object not found'; end if;

  update public.generated_documents
  set status = 'signed',
      pdf_storage_path = signed_pdf_storage_path,
      pdf_size_bytes = signed_pdf_size_bytes,
      pdf_sha256 = signed_pdf_sha256,
      signed_at = now(),
      signed_by_patient = true,
      signed_by_name = trim(signer_name)
  where organization_id = org_id and id = target_document_id;

  if document_consent_type is not null then
    update public.patient_consents
    set status = 'revoked',
        revoked_at = now(),
        revoked_by = auth.uid(),
        revocation_reason = 'Заменено новой версией согласия'
    where organization_id = org_id
      and patient_id = document_patient_id
      and consent_type = document_consent_type
      and status = 'granted';

    select coalesce(max(consent.version), 0) + 1 into next_consent_version
    from public.patient_consents consent
    where consent.organization_id = org_id
      and consent.patient_id = document_patient_id
      and consent.consent_type = document_consent_type;

    insert into public.patient_consents (
      organization_id, patient_id, consent_type, version, status,
      granted_at, document_id, granted_by
    ) values (
      org_id, document_patient_id, document_consent_type,
      greatest(next_consent_version, coalesce(document_template_version, 1)),
      'granted', now(), target_document_id, auth.uid()
    );
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'generated_document.signed', 'generated_document', target_document_id,
    jsonb_build_object('signed_by_name', trim(signer_name), 'pdf_sha256', signed_pdf_sha256)
  );
end;
$$;

create or replace function public.revoke_patient_consent(
  org_id uuid,
  target_consent_id uuid,
  revocation_reason_text text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_patient_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'documents.manage') then
    raise exception 'Document manage permission required' using errcode = '42501';
  end if;
  if revocation_reason_text is null or char_length(trim(revocation_reason_text)) not between 3 and 500 then
    raise exception 'Revocation reason is invalid';
  end if;
  update public.patient_consents
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
      revocation_reason = trim(revocation_reason_text)
  where organization_id = org_id and id = target_consent_id and status = 'granted'
  returning patient_id into resolved_patient_id;
  if resolved_patient_id is null then raise exception 'Active consent not found'; end if;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'patient_consent.revoked', 'patient_consent', target_consent_id,
    jsonb_build_object('reason', trim(revocation_reason_text))
  );
  return resolved_patient_id;
end;
$$;

create or replace function public.list_document_templates(
  org_id uuid,
  include_inactive boolean default false
)
returns table (
  id uuid, name text, document_type text, consent_type text,
  title_template text, body_template text, version integer,
  is_active boolean, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    template.id, template.name, template.document_type, template.consent_type,
    template.title_template, template.body_template, template.version,
    template.is_active, template.updated_at
  from public.document_templates template
  where template.organization_id = org_id
    and public.current_user_has_permission(org_id, 'documents.read')
    and (template.is_active or include_inactive and public.current_user_has_permission(org_id, 'documents.manage'))
  order by template.document_type, template.name;
$$;

create or replace function public.list_patient_documents(
  org_id uuid,
  target_patient_id uuid
)
returns table (
  id uuid, encounter_id uuid, template_id uuid, document_type text,
  consent_type text, document_number text, status text, title text,
  template_version integer, pdf_size_bytes bigint, pdf_sha256 text,
  signed_at timestamptz, signed_by_name text, created_at timestamptz,
  created_by_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    document.id, document.encounter_id, document.template_id, document.document_type,
    document.consent_type, document.document_number, document.status, document.title,
    document.template_version, document.pdf_size_bytes, document.pdf_sha256,
    document.signed_at, document.signed_by_name, document.created_at,
    coalesce(nullif(trim(profile.full_name), ''), 'Сотрудник')
  from public.generated_documents document
  join public.profiles profile on profile.id = document.created_by
  where document.organization_id = org_id
    and document.patient_id = target_patient_id
    and public.current_user_has_permission(org_id, 'documents.read')
  order by document.created_at desc;
$$;

create or replace function public.list_patient_consents(
  org_id uuid,
  target_patient_id uuid
)
returns table (
  id uuid, consent_type text, version integer, status text,
  granted_at timestamptz, revoked_at timestamptz, document_id uuid,
  revocation_reason text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    consent.id, consent.consent_type, consent.version, consent.status,
    consent.granted_at, consent.revoked_at, consent.document_id, consent.revocation_reason
  from public.patient_consents consent
  where consent.organization_id = org_id
    and consent.patient_id = target_patient_id
    and public.current_user_has_permission(org_id, 'documents.read')
  order by consent.granted_at desc;
$$;

create or replace function public.get_generated_document_snapshot(
  org_id uuid,
  target_document_id uuid
)
returns table (
  id uuid, patient_id uuid, document_type text, consent_type text,
  document_number text, status text, title text, rendered_body text,
  rendered_data jsonb, pdf_storage_path text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    document.id, document.patient_id, document.document_type, document.consent_type,
    document.document_number, document.status, document.title, document.rendered_body,
    document.rendered_data, document.pdf_storage_path, document.created_at
  from public.generated_documents document
  where document.organization_id = org_id
    and document.id = target_document_id
    and public.current_user_has_permission(org_id, 'documents.read');
$$;

create or replace function public.get_generated_document_storage_location(
  org_id uuid,
  target_document_id uuid
)
returns table (storage_bucket text, storage_path text, file_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    document.storage_bucket,
    document.pdf_storage_path,
    document.document_number || '.pdf'
  from public.generated_documents document
  where document.organization_id = org_id
    and document.id = target_document_id
    and public.current_user_has_permission(org_id, 'documents.read');
$$;

revoke all on function public.save_document_template(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.set_document_template_active(uuid, uuid, boolean) from public;
revoke all on function public.register_generated_document(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, integer, text, bigint, text) from public;
revoke all on function public.sign_generated_document(uuid, uuid, text, text, bigint, text) from public;
revoke all on function public.revoke_patient_consent(uuid, uuid, text) from public;
revoke all on function public.list_document_templates(uuid, boolean) from public;
revoke all on function public.list_patient_documents(uuid, uuid) from public;
revoke all on function public.list_patient_consents(uuid, uuid) from public;
revoke all on function public.get_generated_document_snapshot(uuid, uuid) from public;
revoke all on function public.get_generated_document_storage_location(uuid, uuid) from public;

grant execute on function public.save_document_template(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.set_document_template_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.register_generated_document(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, integer, text, bigint, text) to authenticated;
grant execute on function public.sign_generated_document(uuid, uuid, text, text, bigint, text) to authenticated;
grant execute on function public.revoke_patient_consent(uuid, uuid, text) to authenticated;
grant execute on function public.list_document_templates(uuid, boolean) to authenticated;
grant execute on function public.list_patient_documents(uuid, uuid) to authenticated;
grant execute on function public.list_patient_consents(uuid, uuid) to authenticated;
grant execute on function public.get_generated_document_snapshot(uuid, uuid) to authenticated;
grant execute on function public.get_generated_document_storage_location(uuid, uuid) to authenticated;

commit;
