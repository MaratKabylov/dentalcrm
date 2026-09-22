# Dental CRM / Dental OS
## Master Architecture for Codex Implementation

**Project type:** Multi-tenant SaaS for dental clinics  
**Primary market:** Kazakhstan  
**Frontend / Backend:** Next.js + TypeScript  
**Hosting:** Vercel  
**Database / Auth / Storage / Realtime:** Supabase  
**Architecture style:** Modular monolith with clear domain boundaries  
**Document purpose:** This file is the main implementation specification for Codex.

---

# 1. Product vision

The system is not just a CRM and not just a medical record system.

It is a unified Dental OS for managing a dental clinic:

- patients;
- appointments;
- doctors;
- reception;
- treatment;
- odontogram;
- treatment plans;
- medical records;
- documents;
- CRM;
- communications;
- payments;
- cash desks;
- debts;
- discounts;
- doctors' remuneration;
- inventory;
- materials write-off;
- analytics;
- reports;
- branches;
- users and permissions;
- audit;
- integrations with Kazakhstan services.

The product should combine the strongest parts of:
- MacDent;
- 1C: Dentistry;
- modern SaaS CRM systems;
- modern EMR/MIS approaches.

The interface should be significantly more modern and faster than classical medical systems.

---

# 2. Key architectural principles

## 2.1 Multi-tenancy

One deployment serves multiple clinics.

Main entity:

`organizations`

Each organization may have:
- one clinic;
- several branches;
- several legal entities;
- multiple cash desks;
- multiple warehouses.

Almost every business table must contain:

`organization_id uuid not null`

Branch-specific entities also contain:

`branch_id uuid`

No tenant may access another tenant's data.

Isolation must be implemented primarily through Supabase RLS.

---

## 2.2 Modular monolith

Do NOT start with microservices.

The application is one Next.js project, but domains must be isolated logically.

Main domains:

- auth
- organizations
- users
- patients
- appointments
- clinical
- treatment-plans
- documents
- crm
- communications
- finance
- payroll
- inventory
- analytics
- integrations
- audit
- settings

Each module should have:
- types;
- validation schemas;
- repositories/data access;
- services;
- UI components;
- server actions/API handlers where needed.

Do not allow arbitrary direct DB queries scattered across React components.

---

# 3. Technology stack

## Frontend
- Next.js latest stable
- TypeScript strict mode
- App Router
- React Server Components where appropriate
- TanStack Query for client-side server state where needed
- React Hook Form
- Zod
- Tailwind CSS
- shadcn/ui
- Lucide icons
- date-fns
- Recharts for charts

## Backend
Use Next.js server-side capabilities:
- Route Handlers
- Server Actions
- Supabase server client
- Vercel Functions

For privileged operations:
- use service role only on server;
- never expose service role key to browser.

## Database
Supabase PostgreSQL.

Use:
- UUID primary keys;
- timestamptz;
- jsonb where justified;
- database constraints;
- indexes;
- RLS;
- SQL functions only where business logic benefits from atomic DB execution.

## Authentication
Preferred first implementation:

Supabase Auth.

Support:
- email/password;
- magic link optional;
- invitation flow;
- password reset;
- session management.

Architecture should allow future external IdP / Keycloak integration if enterprise SSO is required.

Do NOT introduce Keycloak in MVP unless actually necessary.

## File storage
Supabase Storage.

Buckets:
- patient-documents
- clinical-media
- signed-documents
- avatars
- organization-assets
- imports
- exports

Private buckets by default.

Signed URLs should be generated server-side.

---

# 4. Repository structure

Recommended structure:

```text
src/
  app/
    (auth)/
    (dashboard)/
      dashboard/
      patients/
      appointments/
      clinical/
      treatment-plans/
      crm/
      finance/
      inventory/
      analytics/
      settings/
    api/

  modules/
    auth/
    organizations/
    users/
    patients/
    appointments/
    clinical/
    treatment-plans/
    documents/
    crm/
    communications/
    finance/
    payroll/
    inventory/
    analytics/
    integrations/
    audit/
    settings/

  components/
    ui/
    shared/
    layout/

  lib/
    supabase/
    permissions/
    validation/
    dates/
    money/
    logging/
    errors/

  types/

supabase/
  migrations/
  seed/
  functions/
```

---

# 5. Identity and tenant model

## 5.1 organizations

```sql
organizations
- id uuid pk
- name text
- legal_name text
- bin text
- timezone text default 'Asia/Almaty'
- currency text default 'KZT'
- locale text default 'ru-KZ'
- status text
- created_at timestamptz
- updated_at timestamptz
```

## 5.2 branches

```sql
branches
- id uuid pk
- organization_id uuid fk
- name text
- address text
- phone text
- email text
- timezone text
- is_active boolean
- created_at timestamptz
- updated_at timestamptz
```

## 5.3 profiles

Linked to `auth.users`.

```sql
profiles
- id uuid pk = auth.users.id
- full_name text
- phone text
- avatar_path text
- locale text
- created_at timestamptz
- updated_at timestamptz
```

## 5.4 organization_members

```sql
organization_members
- id uuid pk
- organization_id uuid fk
- user_id uuid fk profiles
- employee_id uuid nullable
- status text
- joined_at timestamptz
```

Unique:
`organization_id + user_id`

---

# 6. Roles and permissions

Do not hardcode permissions only by role name.

Use RBAC with explicit permissions.

## roles

```sql
roles
- id uuid pk
- organization_id uuid nullable
- code text
- name text
- is_system boolean
```

## permissions

```sql
permissions
- id uuid pk
- code text unique
- description text
```

Examples:

- patients.read
- patients.create
- patients.update
- patients.delete
- appointments.read
- appointments.manage
- clinical.read
- clinical.write
- treatment_plan.manage
- finance.read
- finance.manage
- cashdesk.manage
- inventory.read
- inventory.manage
- reports.read
- settings.manage
- users.manage
- audit.read

## role_permissions

```sql
role_permissions
- role_id
- permission_id
```

## member_roles

```sql
member_roles
- organization_member_id
- role_id
```

Optional branch restrictions:

```sql
member_branch_access
- organization_member_id
- branch_id
```

System roles to seed:
- owner
- administrator
- receptionist
- doctor
- assistant
- cashier
- accountant
- warehouse_manager
- marketer
- manager
- auditor

---

# 7. Employee and doctor model

## employees

```sql
employees
- id uuid pk
- organization_id uuid
- branch_id uuid nullable
- profile_id uuid nullable
- full_name text
- phone text
- email text
- employee_type text
- hire_date date
- termination_date date nullable
- is_active boolean
- color text nullable
- created_at
- updated_at
```

## doctors

```sql
doctors
- id uuid pk
- organization_id uuid
- employee_id uuid
- specialization_id uuid
- room_id uuid nullable
- appointment_duration_minutes int
- accepts_online_booking boolean
- is_active boolean
```

## specializations

```sql
specializations
- id uuid pk
- organization_id uuid
- name text
```

---

# 8. Patient module

Patient card is one of the core entities.

## patients

```sql
patients
- id uuid pk
- organization_id uuid
- external_number text
- iin text nullable
- last_name text
- first_name text
- middle_name text nullable
- birth_date date nullable
- gender text nullable
- phone text
- phone_normalized text
- email text nullable
- address text nullable
- city text nullable
- notes text nullable
- source_id uuid nullable
- primary_branch_id uuid nullable
- responsible_employee_id uuid nullable
- consent_personal_data boolean
- consent_marketing boolean
- created_at
- updated_at
- archived_at timestamptz nullable
```

Important indexes:
- organization_id
- phone_normalized
- iin
- full-text / trigram indexes for name search

IIN must not be globally unique because tenants are isolated.

Within one organization:
unique partial index may be used for non-null IIN.

## patient_contacts

Additional contacts.

```sql
patient_contacts
- id
- organization_id
- patient_id
- type
- value
- is_primary
```

## patient_relations

Family / guardian relations.

```sql
patient_relations
- id
- organization_id
- patient_id
- related_patient_id nullable
- relation_type
- full_name nullable
- phone nullable
```

## patient_tags

Many-to-many tags.

## patient_notes

Structured notes with author and timestamp.

Do NOT overwrite history-sensitive notes.

---

# 9. Patient search

Global search must support:
- IIN;
- phone;
- surname;
- full name;
- patient number;
- partial match.

Search should be fast from any page.

Add command palette:
`Ctrl/Cmd + K`

Search must respect RLS.

---

# 10. Kazakhstan IIN integration

Design integration abstraction:

```ts
interface IdentityProvider {
  lookupByIin(iin: string): Promise<IdentityLookupResult>
}
```

Potential provider:
- Smart Bridge or another legally available government-connected provider.

Do not tightly couple patient module to one provider.

Table:

```sql
integration_identity_lookups
- id
- organization_id
- provider
- iin_hash
- status
- requested_by
- created_at
- response_meta jsonb
```

Do not store excessive source response data if it is not needed.

Desired flow:

1. receptionist enters IIN;
2. backend validates format;
3. backend checks existing patient;
4. integration provider is called;
5. returned allowed fields populate draft patient form;
6. receptionist confirms before saving.

---

# 11. OCR / document recognition

Provide optional module for:
- Kazakhstan ID card;
- passport;
- other identity document.

Flow:
1. upload / camera;
2. OCR service;
3. parse fields;
4. show preview;
5. user confirms;
6. create/update patient.

Never directly overwrite patient data without confirmation.

Store source image only when organization settings and consent allow it.

---

# 12. Scheduling and appointments

This is the operational center of the application.

## appointments

```sql
appointments
- id uuid pk
- organization_id uuid
- branch_id uuid
- patient_id uuid
- doctor_id uuid
- room_id uuid nullable
- start_at timestamptz
- end_at timestamptz
- status_id uuid
- appointment_type_id uuid nullable
- reason text nullable
- notes text nullable
- source_id uuid nullable
- created_by uuid
- confirmed_at timestamptz nullable
- arrived_at timestamptz nullable
- started_at timestamptz nullable
- completed_at timestamptz nullable
- cancelled_at timestamptz nullable
- cancellation_reason_id uuid nullable
- created_at
- updated_at
```

## appointment_statuses

Statuses must be configurable per organization.

Seed:
- planned
- unconfirmed
- confirmed
- arrived
- in_progress
- completed
- cancelled
- no_show
- rescheduled

Do not encode business logic only by display strings.

Each status has:
- code
- name
- color
- is_terminal
- sort_order

## appointment_status_history

Every status transition is logged.

```sql
appointment_status_history
- id
- appointment_id
- from_status_id
- to_status_id
- changed_by
- changed_at
- comment
```

## Calendar UI

Views:
- day
- week
- doctor columns
- rooms
- branch
- multi-doctor board

Features:
- drag & drop;
- resize appointment;
- create from empty slot;
- filters;
- color statuses;
- conflict detection;
- working hours;
- breaks;
- holidays;
- doctor absence.

---

# 13. Doctor schedules

## doctor_working_hours

```sql
doctor_working_hours
- id
- organization_id
- doctor_id
- branch_id
- weekday
- start_time
- end_time
- valid_from
- valid_to nullable
```

## doctor_schedule_exceptions

```sql
doctor_schedule_exceptions
- id
- doctor_id
- date
- type
- start_time nullable
- end_time nullable
- reason
```

Types:
- day_off
- sick_leave
- vacation
- custom_hours
- blocked

---

# 14. Reception workflow

Recommended flow:

Lead / call / message  
→ patient found or created  
→ appointment created  
→ reminder  
→ confirmation  
→ patient arrives  
→ doctor notified  
→ treatment  
→ checkout  
→ follow-up / recall.

When receptionist sets status `arrived`:
- doctor dashboard receives realtime notification;
- appointment visually changes;
- arrival time is logged.

Use Supabase Realtime for in-app events.

---

# 15. Clinical records

## clinical_encounters

One factual visit/encounter.

```sql
clinical_encounters
- id
- organization_id
- branch_id
- patient_id
- appointment_id nullable
- doctor_id
- opened_at
- closed_at nullable
- chief_complaint text nullable
- anamnesis text nullable
- diagnosis_summary text nullable
- clinical_notes text nullable
- status
- created_by
- created_at
- updated_at
```

Do NOT treat an appointment itself as the medical record.

Appointment and encounter are separate entities.

---

# 16. Odontogram

Must support adults and children.

Use tooth numbering compatible with FDI.

## odontograms

```sql
odontograms
- id
- organization_id
- patient_id
- encounter_id nullable
- version_no int
- created_by
- created_at
```

## odontogram_teeth

```sql
odontogram_teeth
- id
- odontogram_id
- tooth_code text
- tooth_state text
- notes text nullable
```

## odontogram_surfaces

```sql
odontogram_surfaces
- id
- odontogram_tooth_id
- surface text
- condition_code text
```

Possible conditions:
- healthy
- caries
- filling
- crown
- missing
- implant
- root
- fracture
- mobility
- extraction_planned
- endodontic
- temporary_filling
- veneer
- bridge_part
- other

Do not save odontogram as one opaque JSON blob only.

Structured rows are needed for analytics and history.

A JSON snapshot may be stored additionally for fast UI hydration.

---

# 17. Diagnoses

## diagnoses

Reference:
- local diagnoses;
- ICD mappings if needed.

```sql
diagnoses
- id
- code
- name
- system
```

## encounter_diagnoses

```sql
encounter_diagnoses
- id
- encounter_id
- diagnosis_id
- tooth_code nullable
- type
- notes
```

---

# 18. Treatment catalogue

## services

```sql
services
- id
- organization_id
- code
- name
- category_id
- duration_minutes
- base_price numeric
- cost_price numeric nullable
- is_active boolean
- vat_rate numeric nullable
```

## service_categories

Hierarchical.

---

# 19. Treatment plans

A treatment plan is independent from a single appointment.

## treatment_plans

```sql
treatment_plans
- id
- organization_id
- patient_id
- doctor_id
- status
- title
- total_amount
- discount_amount
- final_amount
- created_at
- accepted_at nullable
- completed_at nullable
```

Statuses:
- draft
- proposed
- approved
- rejected
- in_progress
- completed
- cancelled

## treatment_plan_items

```sql
treatment_plan_items
- id
- treatment_plan_id
- service_id
- tooth_code nullable
- quantity numeric
- price numeric
- discount numeric
- amount numeric
- priority int
- planned_order int
- status
- notes
```

Treatment plan versioning is required.

Never silently replace an accepted plan.

---

# 20. Clinical procedures

Actual performed procedures must be separated from planned procedures.

## performed_services

```sql
performed_services
- id
- organization_id
- encounter_id
- patient_id
- doctor_id
- service_id
- treatment_plan_item_id nullable
- tooth_code nullable
- quantity
- unit_price
- discount_amount
- final_amount
- performed_at
```

This table is a key source for:
- billing;
- doctor remuneration;
- analytics;
- patient treatment history.

---

# 21. Templates

Support templates for:
- encounter notes;
- anamnesis;
- recommendations;
- diagnoses;
- consent forms;
- treatment notes;
- document text.

Tables:

```sql
clinical_templates
document_templates
```

Templates can be:
- organization-wide;
- doctor-specific.

---

# 22. Medical documents

Documents:
- informed consent;
- treatment agreement;
- treatment plan;
- act;
- recommendations;
- certificates;
- prescriptions if legally supported;
- custom clinic forms.

## generated_documents

```sql
generated_documents
- id
- organization_id
- patient_id
- encounter_id nullable
- template_id
- document_type
- status
- rendered_data jsonb
- pdf_storage_path nullable
- signed_at nullable
- signed_by_patient boolean
- created_by
- created_at
```

Document contents must preserve historical version.

Do not regenerate old signed documents from changed master data.

---

# 23. Attachments and media

## attachments

```sql
attachments
- id
- organization_id
- patient_id nullable
- encounter_id nullable
- treatment_plan_id nullable
- entity_type
- entity_id
- storage_bucket
- storage_path
- mime_type
- file_name
- size_bytes
- uploaded_by
- created_at
```

Media types:
- x-ray
- photo
- scan
- CT
- document
- other

Later support DICOM integration as separate subsystem if needed.

---

# 24. CRM module

CRM must be linked to the patient, but support leads before patient creation.

## leads

```sql
leads
- id
- organization_id
- branch_id nullable
- full_name
- phone
- email nullable
- source_id
- campaign_id nullable
- status
- assigned_to nullable
- notes
- converted_patient_id nullable
- created_at
- updated_at
```

Statuses:
- new
- contacted
- appointment_booked
- thinking
- lost
- converted

## lead_activities

```sql
lead_activities
- id
- lead_id
- type
- body
- employee_id
- created_at
```

---

# 25. Marketing sources

## patient_sources

Examples:
- Instagram
- TikTok
- Google
- 2GIS
- recommendation
- website
- outdoor advertising
- unknown

## marketing_campaigns

Track:
- campaign;
- UTM;
- source;
- cost;
- leads;
- appointments;
- revenue.

---

# 26. Tasks

Unified task subsystem.

## tasks

```sql
tasks
- id
- organization_id
- branch_id nullable
- title
- description
- status
- priority
- assigned_to
- created_by
- due_at nullable
- related_entity_type nullable
- related_entity_id nullable
- created_at
- completed_at nullable
```

Examples:
- call patient;
- confirm visit;
- order material;
- check debt;
- contact inactive patient.

---

# 27. Recall system

## recalls

```sql
recalls
- id
- organization_id
- patient_id
- doctor_id nullable
- recall_type
- due_date
- status
- notes
```

Examples:
- hygiene every 6 months;
- control visit;
- orthodontics;
- implant check;
- unfinished treatment.

Automatic task generation should be possible.

---

# 28. Communications

Create abstraction for communication channels.

Possible:
- SMS;
- WhatsApp;
- Telegram;
- email;
- push notification.

## communication_messages

```sql
communication_messages
- id
- organization_id
- patient_id nullable
- lead_id nullable
- channel
- direction
- provider
- provider_message_id nullable
- status
- recipient
- body
- sent_at nullable
- delivered_at nullable
- error_message nullable
- created_at
```

## communication_templates

Appointment reminders etc.

Do not hardcode provider-specific logic into appointment module.

Use adapter interfaces.

---

# 29. Reminder automation

Configurable rules:

- immediately after booking;
- 24h before;
- 2h before;
- after missed appointment;
- after completed appointment;
- recall date.

## automation_rules

```sql
automation_rules
- id
- organization_id
- event_code
- conditions jsonb
- action_type
- action_config jsonb
- is_active
```

Start simple.

Do not implement a complex workflow engine in MVP.

---

# 30. Finance

Finance must be transaction-based.

Never store only a mutable patient balance field as the source of truth.

## invoices

```sql
invoices
- id
- organization_id
- branch_id
- patient_id
- encounter_id nullable
- status
- subtotal
- discount_amount
- total_amount
- paid_amount
- debt_amount
- issued_at
```

## invoice_items

```sql
invoice_items
- id
- invoice_id
- service_id nullable
- performed_service_id nullable
- description
- quantity
- unit_price
- discount_amount
- amount
```

## payments

```sql
payments
- id
- organization_id
- branch_id
- patient_id
- invoice_id nullable
- cash_desk_id
- payment_method_id
- amount
- paid_at
- status
- external_reference nullable
- created_by
```

Payment methods:
- cash
- card
- Kaspi
- bank_transfer
- mixed
- other

---

# 31. Cash desks

## cash_desks

```sql
cash_desks
- id
- organization_id
- branch_id
- name
- is_active
```

## cash_shifts

```sql
cash_shifts
- id
- cash_desk_id
- opened_by
- opened_at
- opening_balance
- closed_by nullable
- closed_at nullable
- closing_balance nullable
```

## cash_transactions

For manual inflow/outflow not directly represented by payments.

---

# 32. Discounts

Discounts must be auditable.

## discounts

```sql
discounts
- id
- organization_id
- name
- type
- value
- is_active
```

## discount_applications

Record:
- who;
- when;
- why;
- amount before;
- amount after;
- object.

Avoid silently changing historical transaction totals.

---

# 33. Patient account / ledger

Implement financial ledger.

## patient_ledger_entries

```sql
patient_ledger_entries
- id
- organization_id
- patient_id
- entry_type
- source_type
- source_id
- debit
- credit
- occurred_at
```

Balance is derived.

Possible use materialized summary/cached balance for performance, but ledger remains source of truth.

---

# 34. Doctor remuneration

Support:
- percentage of service revenue;
- fixed amount per service;
- percentage of margin;
- individual rates;
- category rates.

## compensation_rules

```sql
compensation_rules
- id
- organization_id
- employee_id nullable
- service_id nullable
- service_category_id nullable
- rule_type
- value
- valid_from
- valid_to nullable
```

## compensation_entries

Calculated entries linked to performed services.

Do not recalculate historical payroll silently after rate changes.

---

# 35. Inventory

## warehouses

```sql
warehouses
- id
- organization_id
- branch_id
- name
```

## inventory_items

```sql
inventory_items
- id
- organization_id
- sku
- name
- category_id
- unit
- min_stock
- is_active
```

## stock_batches

```sql
stock_batches
- id
- warehouse_id
- inventory_item_id
- lot_number nullable
- expiration_date nullable
- unit_cost
- quantity_received
```

## stock_movements

Single source of truth for stock.

```sql
stock_movements
- id
- organization_id
- warehouse_id
- inventory_item_id
- stock_batch_id nullable
- movement_type
- quantity
- unit_cost nullable
- source_type
- source_id
- created_by
- created_at
```

Types:
- receipt
- issue
- transfer_in
- transfer_out
- write_off
- correction
- procedure_usage

Stock balance is derived from movements.

---

# 36. Treatment material norms

## service_material_norms

```sql
service_material_norms
- id
- organization_id
- service_id
- inventory_item_id
- quantity
```

On completed procedure:
- suggest material write-off;
- optionally write off automatically depending on clinic settings.

Manual correction must be possible with audit.

---

# 37. Suppliers and purchases

Later phase:

- suppliers
- purchase_orders
- goods_receipts
- supplier_invoices

Not required for the earliest MVP but schema boundaries should allow adding them.

---

# 38. Analytics

Dashboard metrics:
- revenue;
- payments;
- debt;
- appointments;
- completed appointments;
- cancellations;
- no-shows;
- new patients;
- returning patients;
- doctor utilization;
- average bill;
- conversion lead → appointment;
- conversion appointment → completed treatment;
- treatment plan acceptance;
- unfinished treatment;
- marketing source ROI;
- doctor production;
- material cost.

Filters:
- period;
- branch;
- doctor;
- specialization;
- source.

---

# 39. Executive dashboard

Widgets:
- today schedule;
- today revenue;
- arrivals waiting;
- active treatments;
- debts;
- pending confirmations;
- unfinished treatment plans;
- low stock;
- upcoming recalls;
- overdue tasks.

Dashboards vary by role.

Receptionist should not see the same homepage as owner.

---

# 40. Realtime

Use Supabase Realtime selectively.

Good use cases:
- patient arrived;
- appointment changes;
- doctor waiting room;
- new task;
- internal notification.

Do not subscribe to entire large tables without filters.

---

# 41. Internal notifications

## notifications

```sql
notifications
- id
- organization_id
- user_id
- type
- title
- body
- related_entity_type nullable
- related_entity_id nullable
- read_at nullable
- created_at
```

---

# 42. Audit

Critical.

## audit_log

```sql
audit_log
- id
- organization_id
- actor_user_id nullable
- action
- entity_type
- entity_id
- old_data jsonb nullable
- new_data jsonb nullable
- ip_address inet nullable
- user_agent text nullable
- created_at
```

Audit important changes:
- patient data;
- appointment status;
- clinical records;
- treatment plans;
- payments;
- discounts;
- inventory corrections;
- permissions;
- document signing.

Do not log passwords or secrets.

---

# 43. Soft delete

Yes, soft delete is required, but not blindly for every table.

Use:
- `archived_at`
or
- `deleted_at`

for master/reference/business entities that may need recovery.

Examples:
- patients;
- employees;
- services;
- leads;
- templates.

Do NOT simply soft-delete accounting/audit facts.

Financial and medical historical transactions should usually be:
- cancelled;
- reversed;
- superseded;
- voided;

rather than deleted.

Example:
A payment should not disappear.
Create reversal/cancellation semantics.

---

# 44. RLS strategy

Every tenant-bound table has `organization_id`.

Create helper SQL functions:

```sql
current_user_has_org_access(org_id uuid)
current_user_has_permission(org_id uuid, permission_code text)
```

RLS example:

SELECT policy:
- user is active member of organization;
- user has required permission.

INSERT/UPDATE:
- organization_id must be an organization accessible to current user;
- role permission required.

Do not rely only on frontend route protection.

Frontend permissions improve UX.
RLS provides actual security.

---

# 45. Protected medical data

Clinical data access should support stricter policies.

Possible rule:
- admin/owner with clinical permission;
- treating doctor;
- authorized clinical staff.

Architecture should support future per-branch / per-doctor limitations.

Sensitive actions should be auditable.

---

# 46. API conventions

Prefer:
- server actions for internal form mutations;
- route handlers for integrations/webhooks/public endpoints.

API response shape:

```ts
type ApiSuccess<T> = {
  ok: true
  data: T
}

type ApiError = {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}
```

Use centralized error mapping.

Do not leak database error details to users.

---

# 47. Validation

Every mutation:
1. authenticate;
2. validate Zod schema;
3. authorize;
4. execute transaction;
5. audit;
6. return typed result.

Do not trust browser-supplied:
- organization_id;
- user role;
- total price;
- final balance.

Recalculate authoritative values server-side.

---

# 48. Transactions

Use DB transactions for:
- invoice + invoice items;
- payment + ledger;
- stock transfer;
- treatment completion + financial posting;
- compensation posting;
- reversals.

For multi-step critical operations consider PostgreSQL functions/RPC.

---

# 49. Money

Use PostgreSQL `numeric`, never floating point.

TypeScript should avoid unsafe arithmetic with JS floating point for financial logic.

Use decimal library if complex calculations are required.

Store:
- amount numeric(14,2)

Currency initially:
- KZT

Schema should allow multi-currency later if needed.

---

# 50. Timezones

Store timestamps as `timestamptz`.

Organization/branch timezone determines UI presentation.

Default Kazakhstan timezone should not be hardcoded everywhere.

Use organization settings.

---

# 51. Import/export

Support:
- patients CSV/XLSX;
- services;
- inventory;
- opening balances;
- schedules.

Import flow:
1. upload;
2. parse;
3. map columns;
4. validate;
5. preview;
6. import;
7. error report.

Never insert an entire unvalidated file directly.

Export:
- XLSX;
- CSV;
- PDF where applicable.

---

# 52. Search architecture

Start with PostgreSQL:
- trigram;
- full text search;
- indexed normalized fields.

Do not introduce Elasticsearch in MVP.

Possible unified search:
- patients;
- appointments;
- leads;
- documents;
- services.

---

# 53. UX principles

The UI must feel like a modern SaaS product, not a classic 1C form.

Principles:
- minimal visual noise;
- fast actions;
- keyboard-friendly;
- contextual side panels;
- fewer modal windows;
- predictable navigation;
- reusable command palette;
- saved filters;
- role-based dashboard.

Main desktop layout:

```text
Left sidebar
Top global search / command bar
Main workspace
Contextual right drawer
```

Primary modules:
- Dashboard
- Calendar
- Patients
- CRM
- Treatment
- Finance
- Inventory
- Analytics
- Tasks
- Settings

---

# 54. Patient card UX

Patient page tabs:

1. Overview
2. Appointments
3. Odontogram
4. Treatment plans
5. Medical history
6. Documents
7. Payments
8. Communications
9. Files
10. Activity

Header shows:
- full name;
- age;
- phone;
- IIN;
- debt / balance;
- next appointment;
- responsible doctor;
- tags.

Quick actions:
- new appointment;
- start visit;
- create treatment plan;
- payment;
- send message;
- upload document.

---

# 55. Appointment side panel

Click appointment opens side drawer, not necessarily full page.

Display:
- patient;
- contact;
- status;
- doctor;
- services;
- notes;
- appointment history;
- confirmation;
- financial indicator;
- previous / next appointment.

Quick actions:
- confirm;
- arrived;
- cancel;
- reschedule;
- call;
- message;
- open patient;
- start encounter.

---

# 56. Doctor workspace

Doctor screen should minimize administrative noise.

Sections:
- today patients;
- waiting patients;
- current encounter;
- odontogram;
- diagnoses;
- treatment plan;
- performed services;
- templates;
- media;
- recommendations.

When receptionist marks patient as arrived, doctor sees it instantly.

---

# 57. Integrations architecture

Create provider interfaces.

Domains:
- identity providers;
- SMS;
- WhatsApp;
- payment providers;
- fiscalization;
- accounting;
- telephony;
- email;
- storage/external documents.

Tables:

```sql
integration_connections
integration_events
integration_webhook_events
integration_sync_jobs
```

Connection secrets should be encrypted / stored in secure environment or vault-compatible mechanism.

Never expose secrets in browser.

---

# 58. Integration event inbox

All incoming webhooks:
1. authenticate provider;
2. persist event;
3. deduplicate by provider event id;
4. process;
5. mark status;
6. retain error for retry.

## integration_webhook_events

```sql
- id
- organization_id nullable
- provider
- external_event_id
- event_type
- payload jsonb
- status
- attempts
- received_at
- processed_at nullable
- error nullable
```

Unique:
`provider + external_event_id`

---

# 59. Background processing

Vercel serverless should not be used for long-running blocking jobs.

For initial architecture:
- Vercel Cron for scheduled jobs;
- Supabase Edge Functions if suitable;
- database job tables;
- external queue later if needed.

Jobs:
- reminders;
- recall processing;
- daily metrics;
- stale leads;
- exports;
- large imports;
- integration retries.

## jobs

```sql
jobs
- id
- organization_id nullable
- type
- payload jsonb
- status
- attempts
- run_after
- locked_at nullable
- completed_at nullable
- last_error nullable
```

---

# 60. Vercel deployment

Recommended environments:
- Production
- Preview
- Development

Environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
APP_URL
```

Important:
Secrets must NOT use `NEXT_PUBLIC_`.

Only variables intended for browser may use `NEXT_PUBLIC_`.

Vercel Git integration:
- production deploy from main;
- preview deployments from PR/branches.

---

# 61. Supabase environments

Use separate Supabase projects/databases for production and development if possible.

Recommended:
- dental-dev
- dental-prod

Optionally staging later.

Migrations must be committed to repository.

Never manually change production schema without migration.

---

# 62. Migration policy

All DB changes go through:

```text
supabase/migrations/
```

Naming example:

```text
202609220001_create_organizations.sql
202609220002_create_auth_membership.sql
...
```

Migrations should include:
- table;
- constraints;
- indexes;
- triggers;
- RLS;
- policies.

---

# 63. Seed

Create seed data:
- system permissions;
- system roles;
- appointment statuses;
- default payment methods;
- tooth conditions;
- basic patient sources.

Development demo organization should include realistic demo data.

Never seed real patient data.

---

# 64. Observability

Add:
- structured server logs;
- error tracking (e.g. Sentry later);
- integration error log;
- audit log.

Log correlation IDs for complex requests.

Do not log IINs, medical notes, tokens, or secrets unnecessarily.

---

# 65. Performance targets

Typical pages should feel instant.

Target:
- indexed patient lookup under normal SaaS load;
- calendar query only visible date interval;
- pagination everywhere;
- avoid fetching entire patient histories by default;
- use summary endpoints/views.

Do not use `select *` for large tables in production paths.

---

# 66. Database views

Useful views:
- patient_balance_summary
- patient_last_appointment
- doctor_daily_schedule
- inventory_balance
- daily_revenue_summary
- treatment_plan_progress
- patient_activity_summary

Views are not a replacement for source tables.

---

# 67. Materialized summaries

For expensive analytics, later use:
- materialized views;
- summary tables;
- scheduled refresh.

Do not calculate entire organization analytics synchronously on dashboard load.

---

# 68. Data retention

Organization settings should support retention policies later.

Critical:
- medical history;
- financial history;
- audit history;
- signed documents

must not be deleted casually.

Hard deletion should be restricted to exceptional administrative/legal procedures.

---

# 69. Security basics

Required:
- RLS on all tenant tables;
- CSRF-safe framework patterns;
- secure cookies;
- no service key in browser;
- input validation;
- server-side authorization;
- signed storage URLs;
- webhook signature validation;
- rate limiting for public endpoints;
- brute-force protection via auth provider.

---

# 70. Public online booking

Later/public module:

```text
/book/[organization-slug]
```

Patient chooses:
- branch;
- service;
- doctor;
- date/time;
- name;
- phone.

Flow:
- optional phone verification;
- appointment created with source `online`;
- receptionist receives notification.

Do not expose internal calendar data.

Return only available slots.

---

# 71. Wait list

## waitlist_entries

```sql
waitlist_entries
- id
- organization_id
- patient_id
- branch_id
- doctor_id nullable
- service_id nullable
- preferred_from
- preferred_to
- notes
- status
```

When slot becomes available, receptionist can contact patient.

Automation can be added later.

---

# 72. Patient duplicate detection

Before creating patient:
- normalize phone;
- check IIN;
- fuzzy name + DOB;
- show potential duplicates.

Do not automatically merge.

## patient_merge_log

Track approved merges.

---

# 73. Merge behavior

When merging patients:
- choose canonical patient;
- reassign references transactionally;
- keep alias/source record;
- audit the operation.

Never delete historical references manually.

---

# 74. Legal entities

A clinic network may have multiple legal entities.

## legal_entities

```sql
legal_entities
- id
- organization_id
- name
- bin
- legal_address
- bank_details jsonb
- is_active
```

Branches / cash desks can reference legal entity.

Useful for Kazakhstan billing/accounting integrations.

---

# 75. Accounting integration

Design future adapter for:
- 1C accounting;
- external accounting systems.

Potential sync entities:
- patients/customers;
- services;
- payments;
- sales documents;
- stock.

Do not directly couple clinical tables to 1C-specific identifiers.

Use mapping table:

```sql
external_entity_mappings
- organization_id
- provider
- entity_type
- local_id
- external_id
```

---

# 76. Consent management

## patient_consents

```sql
patient_consents
- id
- organization_id
- patient_id
- consent_type
- version
- status
- granted_at
- revoked_at nullable
- document_id nullable
```

Types:
- personal_data
- medical_treatment
- marketing
- photo
- communication

---

# 77. Activity timeline

Patient timeline combines events:
- created;
- appointment;
- call;
- message;
- encounter;
- document;
- plan;
- payment;
- refund;
- task;
- recall.

Do not store all activity as duplicated text if source records already exist.

Can use unified activity projection/view.

---

# 78. Deletion/cancellation model

Use explicit domain actions.

Examples:

Appointment:
- cancelled

Payment:
- reversed/refunded

Invoice:
- voided

Treatment plan:
- cancelled/superseded

Encounter:
- amended/locked

Clinical note after locking:
- amendment record

This is safer than destructive updates.

---

# 79. Clinical record locking

After encounter is finalized:
- lock core clinical fields;
- later changes create amendment;
- audit who changed and why.

## clinical_amendments

```sql
clinical_amendments
- id
- encounter_id
- author_id
- reason
- amendment_data jsonb
- created_at
```

---

# 80. Optimistic concurrency

Important for:
- appointments;
- patient card;
- treatment plan.

Use `updated_at` or version number checks to prevent silent overwriting.

---

# 81. Feature flags

## feature_flags

```sql
feature_flags
- id
- organization_id nullable
- key
- enabled
- config jsonb
```

Useful for gradual rollout:
- OCR;
- online booking;
- Smart Bridge;
- payroll;
- inventory;
- AI assistant.

---

# 82. AI features - future ready

Potential later features:
- summarize clinical history;
- draft treatment notes;
- identify unfinished treatment;
- receptionist assistant;
- patient communication drafts;
- management insights.

AI must not autonomously modify clinical or financial facts.

Every generated clinical suggestion requires doctor confirmation.

Keep AI behind service abstraction.

---

# 83. Main route map

```text
/login
/onboarding

/dashboard

/calendar

/patients
/patients/[id]
/patients/[id]/overview
/patients/[id]/odontogram
/patients/[id]/treatment
/patients/[id]/history
/patients/[id]/finance
/patients/[id]/documents

/crm/leads
/crm/tasks
/crm/recalls
/crm/communications

/finance
/finance/payments
/finance/invoices
/finance/cash
/finance/debts
/finance/payroll

/inventory
/inventory/items
/inventory/warehouses
/inventory/movements

/analytics

/settings
/settings/organization
/settings/branches
/settings/users
/settings/roles
/settings/doctors
/settings/services
/settings/schedules
/settings/templates
/settings/integrations
/settings/automation
```

---

# 84. Development phases

## Phase 0 — foundation

Implement:
- Next.js project;
- Supabase setup;
- migrations;
- auth;
- organizations;
- memberships;
- RBAC;
- RLS;
- layout;
- navigation;
- settings basics;
- audit base.

Result:
secure multi-tenant shell.

---

## Phase 1 — patients and calendar

Implement:
- patients;
- patient search;
- duplicate detection;
- doctors;
- branches;
- rooms;
- work schedules;
- appointments;
- statuses;
- status history;
- day/week calendar;
- patient arrival;
- realtime doctor notification.

This phase must already be usable at reception.

---

## Phase 2 — clinical MVP

Implement:
- encounters;
- odontogram;
- diagnoses;
- services;
- performed services;
- treatment plans;
- treatment plan versions;
- clinical templates;
- file attachments.

This phase makes system usable by doctors.

---

## Phase 3 — finance

Implement:
- invoices;
- invoice items;
- payments;
- patient ledger;
- cash desks;
- shifts;
- discounts;
- debts;
- refunds/reversals.

---

## Phase 4 — CRM

Implement:
- leads;
- sources;
- tasks;
- recalls;
- communications;
- templates;
- appointment reminders;
- marketing attribution.

---

## Phase 5 — documents

Implement:
- document templates;
- PDF rendering;
- consent storage;
- signed historical snapshots;
- export/print.

---

## Phase 6 — inventory

Implement:
- warehouses;
- materials;
- stock movements;
- batches;
- expiry;
- procedure material norms;
- write-off.

---

## Phase 7 — analytics/payroll

Implement:
- executive dashboard;
- doctor performance;
- receptionist conversion;
- source analytics;
- doctor compensation;
- inventory analytics.

---

## Phase 8 — Kazakhstan integrations

Implement provider adapters:
- Smart Bridge / identity lookup;
- OCR;
- SMS;
- WhatsApp;
- payment/fiscal systems if selected;
- 1C synchronization if required.

---

# 85. Codex implementation rules

Codex MUST:

1. preserve multi-tenancy;
2. use RLS from the beginning;
3. create SQL migrations for every schema change;
4. not bypass RLS from client code;
5. not expose service role key;
6. use Zod validation;
7. use strict TypeScript;
8. avoid `any`;
9. keep domain modules separated;
10. use transactions for financial/stock operations;
11. implement audit for sensitive mutations;
12. use soft-delete/cancellation rules described above;
13. avoid huge files/components;
14. create reusable UI components;
15. write tests for core business logic;
16. not add unnecessary dependencies;
17. not introduce microservices prematurely;
18. not store derived balances as sole source of truth;
19. not use unstructured JSON when relational data is important;
20. keep provider integrations behind interfaces.

---

# 86. Testing strategy

## Unit tests
Test:
- money calculations;
- treatment plan totals;
- discount calculations;
- compensation calculations;
- stock balance calculations;
- permission checks.

## Integration tests
Test:
- RLS tenant isolation;
- appointment creation;
- payment posting;
- reversal;
- treatment completion;
- stock movement transaction.

## E2E
Use Playwright.

Critical flows:
1. login;
2. create patient;
3. book appointment;
4. patient arrived;
5. doctor opens encounter;
6. treatment plan;
7. perform service;
8. checkout/payment;
9. receipt/financial history.

---

# 87. Definition of Done

A feature is complete only if:

- database migration exists;
- RLS exists;
- permission exists;
- validation exists;
- error handling exists;
- audit exists where needed;
- UI handles loading/empty/error states;
- tests exist for critical logic;
- tenant isolation is verified;
- mobile/tablet layout is acceptable where relevant.

---

# 88. Initial database build order

Recommended migration order:

1. organizations
2. profiles
3. branches
4. memberships
5. roles
6. permissions
7. RLS helpers
8. employees
9. doctors
10. patients
11. patient tags/contacts
12. rooms
13. schedules
14. appointments
15. appointment history
16. services
17. encounters
18. odontogram
19. diagnoses
20. treatment plans
21. performed services
22. invoices
23. payments
24. ledger
25. documents
26. tasks
27. leads
28. communications
29. inventory
30. audit
31. integration framework

---

# 89. Recommended first Codex task

Do NOT ask Codex to build the entire application in one prompt.

First task:

> Implement Phase 0 of the Dental OS architecture from this document. Create the Next.js application structure, Supabase migrations for organizations, branches, profiles, organization_members, roles, permissions, role_permissions, member_roles, RLS helper functions and policies. Implement Supabase Auth login, invitation-ready membership model, protected dashboard layout, organization context and role/permission checks. Add seed data for system permissions and roles. Do not implement patient or appointment modules yet. All DB changes must be migrations. Use TypeScript strict mode, Zod and server-side authorization.

After Phase 0 is stable:

> Implement Phase 1 exactly according to this architecture.

---

# 90. Product goal

The final system should allow a clinic to run its core daily operations without needing separate disconnected systems for:

- scheduling;
- patient database;
- dental chart;
- treatment plans;
- CRM;
- payments;
- debt;
- documents;
- inventory;
- management analytics.

The architecture intentionally separates immutable/auditable facts from editable operational data.

The most important principles are:

**security, tenant isolation, fast reception workflow, convenient doctor workspace, correct medical history, correct financial ledger, auditable operations and modular extensibility.**
