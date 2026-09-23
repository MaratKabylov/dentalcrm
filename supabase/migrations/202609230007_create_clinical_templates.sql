create table public.clinical_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text,
  chief_complaint text,
  anamnesis text,
  diagnosis_summary text,
  clinical_notes text,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_templates_description_length_check check (
    description is null or char_length(description) <= 500
  ),
  constraint clinical_templates_chief_complaint_length_check check (
    chief_complaint is null or char_length(chief_complaint) <= 4000
  ),
  constraint clinical_templates_anamnesis_length_check check (
    anamnesis is null or char_length(anamnesis) <= 8000
  ),
  constraint clinical_templates_diagnosis_summary_length_check check (
    diagnosis_summary is null or char_length(diagnosis_summary) <= 4000
  ),
  constraint clinical_templates_clinical_notes_length_check check (
    clinical_notes is null or char_length(clinical_notes) <= 12000
  ),
  constraint clinical_templates_content_check check (
    chief_complaint is not null
    or anamnesis is not null
    or diagnosis_summary is not null
    or clinical_notes is not null
  ),
  unique (organization_id, id)
);

create unique index clinical_templates_name_unique_idx
  on public.clinical_templates (organization_id, lower(name));
create index clinical_templates_active_name_idx
  on public.clinical_templates (organization_id, is_active, name);

create trigger clinical_templates_set_updated_at
before update on public.clinical_templates
for each row execute function public.set_updated_at();

alter table public.clinical_templates enable row level security;

create policy clinical_templates_select on public.clinical_templates
for select to authenticated
using (
  public.current_user_has_permission(organization_id, 'clinical.read')
  or public.current_user_has_permission(organization_id, 'settings.manage')
);

grant select on public.clinical_templates to authenticated;

create or replace function public.save_clinical_template(
  org_id uuid,
  target_template_id uuid,
  template_name text,
  template_description text,
  template_chief_complaint text,
  template_anamnesis text,
  template_diagnosis_summary text,
  template_clinical_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_template_id uuid;
  normalized_name text;
  normalized_description text;
  normalized_chief_complaint text;
  normalized_anamnesis text;
  normalized_diagnosis_summary text;
  normalized_clinical_notes text;
  audit_action text;
begin
  if not public.current_user_has_permission(org_id, 'settings.manage') then
    raise exception 'Settings manage permission required' using errcode = '42501';
  end if;

  normalized_name := nullif(trim(template_name), '');
  normalized_description := nullif(trim(template_description), '');
  normalized_chief_complaint := nullif(trim(template_chief_complaint), '');
  normalized_anamnesis := nullif(trim(template_anamnesis), '');
  normalized_diagnosis_summary := nullif(trim(template_diagnosis_summary), '');
  normalized_clinical_notes := nullif(trim(template_clinical_notes), '');

  if normalized_name is null or char_length(normalized_name) not between 2 and 160 then
    raise exception 'Clinical template name is invalid';
  end if;
  if normalized_description is not null and char_length(normalized_description) > 500 then
    raise exception 'Clinical template description is too long';
  end if;
  if normalized_chief_complaint is not null and char_length(normalized_chief_complaint) > 4000 then
    raise exception 'Clinical template chief complaint is too long';
  end if;
  if normalized_anamnesis is not null and char_length(normalized_anamnesis) > 8000 then
    raise exception 'Clinical template anamnesis is too long';
  end if;
  if normalized_diagnosis_summary is not null and char_length(normalized_diagnosis_summary) > 4000 then
    raise exception 'Clinical template diagnosis summary is too long';
  end if;
  if normalized_clinical_notes is not null and char_length(normalized_clinical_notes) > 12000 then
    raise exception 'Clinical template clinical notes are too long';
  end if;
  if normalized_chief_complaint is null
    and normalized_anamnesis is null
    and normalized_diagnosis_summary is null
    and normalized_clinical_notes is null
  then
    raise exception 'Clinical template must contain at least one field';
  end if;

  if target_template_id is null then
    insert into public.clinical_templates (
      organization_id, name, description, chief_complaint, anamnesis,
      diagnosis_summary, clinical_notes, created_by, updated_by
    ) values (
      org_id, normalized_name, normalized_description,
      normalized_chief_complaint, normalized_anamnesis,
      normalized_diagnosis_summary, normalized_clinical_notes,
      auth.uid(), auth.uid()
    ) returning id into saved_template_id;
    audit_action := 'clinical_template.created';
  else
    update public.clinical_templates
    set name = normalized_name,
        description = normalized_description,
        chief_complaint = normalized_chief_complaint,
        anamnesis = normalized_anamnesis,
        diagnosis_summary = normalized_diagnosis_summary,
        clinical_notes = normalized_clinical_notes,
        updated_by = auth.uid()
    where id = target_template_id and organization_id = org_id
    returning id into saved_template_id;

    if saved_template_id is null then
      raise exception 'Clinical template not found';
    end if;
    audit_action := 'clinical_template.updated';
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), audit_action, 'clinical_template', saved_template_id,
    jsonb_build_object(
      'name', normalized_name,
      'has_chief_complaint', normalized_chief_complaint is not null,
      'has_anamnesis', normalized_anamnesis is not null,
      'has_diagnosis_summary', normalized_diagnosis_summary is not null,
      'has_clinical_notes', normalized_clinical_notes is not null
    )
  );

  return saved_template_id;
end;
$$;

create or replace function public.set_clinical_template_active(
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
  if not public.current_user_has_permission(org_id, 'settings.manage') then
    raise exception 'Settings manage permission required' using errcode = '42501';
  end if;

  update public.clinical_templates
  set is_active = target_is_active,
      updated_by = auth.uid()
  where id = target_template_id and organization_id = org_id;
  if not found then
    raise exception 'Clinical template not found';
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    org_id, auth.uid(), 'clinical_template.activity_changed', 'clinical_template',
    target_template_id, jsonb_build_object('is_active', target_is_active)
  );
end;
$$;

create or replace function public.list_clinical_templates(org_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  chief_complaint text,
  anamnesis text,
  diagnosis_summary text,
  clinical_notes text,
  is_active boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    template.id,
    template.name,
    template.description,
    template.chief_complaint,
    template.anamnesis,
    template.diagnosis_summary,
    template.clinical_notes,
    template.is_active,
    template.updated_at
  from public.clinical_templates template
  where template.organization_id = org_id
    and (
      public.current_user_has_permission(org_id, 'clinical.read')
      or public.current_user_has_permission(org_id, 'settings.manage')
    )
    and (
      template.is_active
      or public.current_user_has_permission(org_id, 'settings.manage')
    )
  order by template.is_active desc, template.name;
$$;

revoke all on function public.save_clinical_template(
  uuid, uuid, text, text, text, text, text, text
) from public;
revoke all on function public.set_clinical_template_active(uuid, uuid, boolean) from public;
revoke all on function public.list_clinical_templates(uuid) from public;

grant execute on function public.save_clinical_template(
  uuid, uuid, text, text, text, text, text, text
) to authenticated;
grant execute on function public.set_clinical_template_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_clinical_templates(uuid) to authenticated;
