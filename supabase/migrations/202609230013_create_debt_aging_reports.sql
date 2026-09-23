begin;

create or replace function public.get_debt_aging_summary(
  org_id uuid,
  target_branch_id uuid default null
)
returns table (
  patient_count bigint,
  invoice_count bigint,
  total_debt numeric,
  debt_0_7 numeric,
  debt_8_30 numeric,
  debt_31_60 numeric,
  debt_61_90 numeric,
  debt_91_plus numeric,
  maximum_age_days integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with debt_rows as (
    select
      invoice.patient_id,
      invoice.debt_amount,
      greatest(
        (now() at time zone organization.timezone)::date
          - (invoice.issued_at at time zone organization.timezone)::date,
        0
      )::integer as age_days
    from public.organizations organization
    join public.invoices invoice
      on invoice.organization_id = organization.id
      and invoice.debt_amount > 0
      and (target_branch_id is null or invoice.branch_id = target_branch_id)
    where organization.id = org_id
      and public.current_user_has_permission(org_id, 'finance.read')
  )
  select
    count(distinct debt.patient_id),
    count(*),
    coalesce(sum(debt.debt_amount), 0),
    coalesce(sum(debt.debt_amount) filter (where debt.age_days between 0 and 7), 0),
    coalesce(sum(debt.debt_amount) filter (where debt.age_days between 8 and 30), 0),
    coalesce(sum(debt.debt_amount) filter (where debt.age_days between 31 and 60), 0),
    coalesce(sum(debt.debt_amount) filter (where debt.age_days between 61 and 90), 0),
    coalesce(sum(debt.debt_amount) filter (where debt.age_days >= 91), 0),
    coalesce(max(debt.age_days), 0)
  from debt_rows debt;
$$;

create or replace function public.list_debt_invoices(
  org_id uuid,
  target_branch_id uuid default null,
  target_aging_bucket text default 'all',
  search_query text default null,
  result_limit integer default 500
)
returns table (
  invoice_id uuid,
  invoice_number text,
  patient_id uuid,
  patient_name text,
  patient_external_number text,
  patient_phone text,
  branch_id uuid,
  branch_name text,
  invoice_status text,
  total_amount numeric,
  paid_amount numeric,
  debt_amount numeric,
  issued_at timestamptz,
  age_days integer,
  aging_bucket text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with debt_rows as (
    select
      invoice.id as invoice_id,
      invoice.invoice_number,
      invoice.patient_id,
      trim(concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name)) as patient_name,
      patient.external_number as patient_external_number,
      patient.phone as patient_phone,
      invoice.branch_id,
      branch.name as branch_name,
      invoice.status as invoice_status,
      invoice.total_amount,
      invoice.paid_amount,
      invoice.debt_amount,
      invoice.issued_at,
      greatest(
        (now() at time zone organization.timezone)::date
          - (invoice.issued_at at time zone organization.timezone)::date,
        0
      )::integer as age_days
    from public.invoices invoice
    join public.organizations organization on organization.id = invoice.organization_id
    join public.patients patient
      on patient.id = invoice.patient_id and patient.organization_id = invoice.organization_id
    join public.branches branch
      on branch.id = invoice.branch_id and branch.organization_id = invoice.organization_id
    where invoice.organization_id = org_id
      and invoice.debt_amount > 0
      and (target_branch_id is null or invoice.branch_id = target_branch_id)
      and (
        nullif(trim(search_query), '') is null
        or invoice.invoice_number ilike '%' || trim(search_query) || '%'
        or patient.external_number ilike '%' || trim(search_query) || '%'
        or patient.phone ilike '%' || trim(search_query) || '%'
        or trim(concat_ws(' ', patient.last_name, patient.first_name, patient.middle_name))
          ilike '%' || trim(search_query) || '%'
      )
      and public.current_user_has_permission(org_id, 'finance.read')
  )
  select
    debt.invoice_id,
    debt.invoice_number,
    debt.patient_id,
    debt.patient_name,
    debt.patient_external_number,
    debt.patient_phone,
    debt.branch_id,
    debt.branch_name,
    debt.invoice_status,
    debt.total_amount,
    debt.paid_amount,
    debt.debt_amount,
    debt.issued_at,
    debt.age_days,
    case
      when debt.age_days <= 7 then '0_7'
      when debt.age_days <= 30 then '8_30'
      when debt.age_days <= 60 then '31_60'
      when debt.age_days <= 90 then '61_90'
      else '91_plus'
    end
  from debt_rows debt
  where target_aging_bucket = 'all'
    or (target_aging_bucket = '0_7' and debt.age_days between 0 and 7)
    or (target_aging_bucket = '8_30' and debt.age_days between 8 and 30)
    or (target_aging_bucket = '31_60' and debt.age_days between 31 and 60)
    or (target_aging_bucket = '61_90' and debt.age_days between 61 and 90)
    or (target_aging_bucket = '91_plus' and debt.age_days >= 91)
  order by debt.age_days desc, debt.debt_amount desc, debt.issued_at
  limit least(greatest(result_limit, 1), 1000);
$$;

revoke all on function public.get_debt_aging_summary(uuid, uuid) from public;
revoke all on function public.list_debt_invoices(uuid, uuid, text, text, integer) from public;

grant execute on function public.get_debt_aging_summary(uuid, uuid) to authenticated;
grant execute on function public.list_debt_invoices(uuid, uuid, text, text, integer) to authenticated;

commit;
