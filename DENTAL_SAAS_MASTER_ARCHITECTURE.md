# Dental SaaS — Master Architecture & Implementation Specification

**Document purpose:** единый архитектурный документ для реализации облачной системы управления стоматологической клиникой.  
**Target:** современный SaaS для Казахстана, функционально глубже MacDent и сопоставимый по бизнес-процессам со Stoma1C, но без наследования 1С-архитектуры.  
**Primary implementation consumer:** Codex / разработчики проекта.  
**Status:** Architecture baseline v1.0  
**Date:** 2026-09-06

---

# 0. Инструкция Codex

Этот документ является **master-spec**. Реализацию вести последовательно по этапам, указанным в разделе `27. Этапы реализации`.

Правила:

1. Не реализовывать весь продукт одним большим PR.
2. Каждый домен должен иметь:
   - модели данных;
   - миграции;
   - backend module;
   - API;
   - permissions;
   - audit events;
   - unit/integration tests;
   - frontend UI;
   - документацию API.
3. Все бизнес-таблицы должны быть tenant-aware.
4. Прямой доступ frontend к медицинским и финансовым таблицам запрещён: бизнес-операции проходят через backend API.
5. Не хранить критические бизнес-состояния только в JSON.
6. Не использовать hard delete для медицинских, финансовых и аудируемых сущностей.
7. Все денежные операции — через ledger.
8. Все изменения клинической документации — версионные.
9. Все межмодульные фоновые действия — через события/outbox, а не скрытые side effects.
10. Архитектура должна позволять одной кодовой базе обслуживать одну клинику, сеть клиник и десятки независимых tenants.
11. Не создавать fork/отдельную сборку под каждого клиента. Кастомизация делается настройками, правилами, шаблонами, custom fields и integrations.
12. Интеграции строятся через provider interfaces. Нельзя жёстко привязывать доменную логику к одному WhatsApp/IIN/телефонии/платёжному поставщику.
13. Функции, связанные с государственными системами Казахстана, должны быть изолированы в `Government Integration`.
14. AI никогда не должен автоматически подписывать медицинский документ, ставить окончательный диагноз или выполнять необратимую финансовую операцию без явного подтверждения сотрудника.
15. В спорной ситуации приоритет: целостность данных > аудит > безопасность > удобство.

---

# 1. Видение продукта

Продукт — не просто CRM и не просто МИС.

Целевая модель:

```text
Dental SaaS
│
├── CRM
│   ├── Leads
│   ├── Opportunities
│   ├── Calls / WhatsApp
│   ├── Tasks
│   └── Marketing attribution
│
├── Scheduling
│   ├── Calendar
│   ├── Doctors
│   ├── Chairs
│   ├── Rooms
│   ├── Waitlist
│   └── Recall
│
├── Medical / EMR
│   ├── Encounters
│   ├── Clinical Notes
│   ├── Odontogram
│   ├── Diagnoses
│   ├── Treatment Plans
│   ├── Images
│   └── Documents
│
├── ERP
│   ├── Payments
│   ├── Patient Ledger
│   ├── Cashboxes
│   ├── Payroll
│   ├── Inventory
│   ├── Labs
│   └── Insurance
│
├── Patient Experience
│   ├── Online booking
│   ├── Digital intake
│   ├── Patient portal
│   ├── Family accounts
│   ├── Notifications
│   └── Reviews
│
└── Platform
    ├── Multi-tenancy
    ├── RBAC/ABAC
    ├── Audit
    ├── Integrations
    ├── Billing
    ├── Analytics
    └── AI
```

Главная продуктовая идея:

> **Функциональная глубина Stoma1C + простота и SaaS-подход MacDent + modern patient experience + AI + архитектура, ориентированная на Казахстан.**

---

# 2. Основные архитектурные принципы

## 2.1 Modular Monolith first

На старте использовать **модульный монолит**, а не микросервисы.

Причины:
- быстрее разработка;
- проще транзакции;
- проще тестирование;
- меньше DevOps-нагрузка;
- доменные границы всё равно позволяют позже вынести отдельные сервисы.

Backend должен быть организован так, чтобы любой крупный модуль позже можно было вынести в самостоятельный сервис.

## 2.2 Domain boundaries

Запрещено создавать один глобальный `ClinicService` или огромный набор CRUD-контроллеров.

Каждый домен владеет своими таблицами и бизнес-правилами.

Например:

```text
Scheduling
    owns appointments

Clinical
    owns encounters / clinical_notes

Finance
    owns ledger / payments

Inventory
    owns stock movements
```

Finance не должен напрямую обновлять таблицу Clinical и наоборот.

## 2.3 Event-driven внутри модульного монолита

Пример:

```text
ProcedureCompleted
        ↓
Finance creates charge
        ↓
Inventory consumes recipe
        ↓
Compensation creates accrual
        ↓
Analytics updates projections
```

Каждый модуль реагирует на событие независимо.

## 2.4 Source of truth

Для каждой бизнес-сущности должен существовать один authoritative source.

Примеры:

```text
Appointment status → Scheduling
Patient balance     → Finance ledger
Stock balance       → Inventory movements
Doctor salary       → Compensation accruals
Clinical history    → Clinical versions
```

Не хранить дублирующие «текущие остатки» как единственную истину.

Допускаются materialized/projection таблицы для производительности, но их всегда можно пересчитать.

---

# 3. Рекомендуемый стек

## Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Hook Form
- Zod
- FullCalendar или аналог для расписания

## Backend

- NestJS
- TypeScript
- REST API
- WebSocket/SSE для realtime событий
- OpenAPI

## Database

- PostgreSQL
- `uuid` primary keys
- JSONB только для extensible metadata/settings
- Postgres full-text search на первом этапе
- pg_trgm для fuzzy matching пациентов

## Persistence layer

Рекомендуется:
- Prisma **или**
- Drizzle ORM

Выбрать один ORM и использовать последовательно.

Для сложных SQL/reporting запросов разрешён raw SQL внутри repository/query layer.

## Auth

Варианты:
- self-hosted Supabase Auth;
- Keycloak;
- собственный OIDC-compatible слой.

Рекомендация для MVP:
- self-hosted Supabase Auth или Keycloak;
- backend всё равно обязан выполнять свою проверку permissions.

## Cache

- Redis

## Background jobs

- BullMQ + Redis для MVP

Позже при необходимости:
- RabbitMQ / NATS

## Files

- S3-compatible storage
- MinIO для self-hosted deployment

## Search

Phase 1:
- PostgreSQL FTS + pg_trgm

Later:
- OpenSearch при реальной необходимости.

## Analytics

Phase 1:
- PostgreSQL read models/materialized views

Later:
- ClickHouse

## Deployment

- Docker
- Docker Compose / Coolify для первых инсталляций
- Kubernetes — только после появления реальной необходимости.

## Observability

- OpenTelemetry
- Prometheus
- Grafana
- Loki
- error tracking

---

# 4. Monorepo

Рекомендуемая структура:

```text
/apps
  /web
  /api
  /worker

/packages
  /ui
  /contracts
  /config
  /eslint-config
  /tsconfig
  /testing
  /sdk

/infrastructure
  /docker
  /coolify
  /monitoring
  /backup

/docs
  /architecture
  /api
  /integrations

/scripts
```

Backend:

```text
apps/api/src/modules
  platform
  organizations
  identity
  employees
  compensation
  patients
  crm
  workflow
  scheduling
  recall
  clinical
  odontogram
  treatment-plans
  laboratory
  imaging
  documents
  insurance
  finance
  inventory
  communications
  marketing
  analytics
  integrations
  government
```

---

# 5. Multi-tenancy

## 5.1 Основные уровни

```text
Tenant
 └── Organization
      ├── Branch
      │    ├── Department
      │    ├── Room
      │    ├── Chair
      │    ├── Warehouse
      │    └── Cashbox
      └── Branch
```

`tenant` — юридическая/логическая граница SaaS.

`organization` — организация внутри tenant.

`branch` — филиал/клиника.

## 5.2 Tenant isolation

Каждая бизнес-таблица должна иметь:

```text
tenant_id UUID NOT NULL
```

Большинство операционных таблиц также:

```text
branch_id UUID NULL/NOT NULL
```

В зависимости от природы сущности.

## 5.3 Нельзя доверять tenant_id от клиента

Backend получает tenant из authenticated context.

Запрос:

```json
{
  "patientId": "..."
}
```

но не:

```json
{
  "tenantId": "...",
  "patientId": "..."
}
```

если tenant уже определяется сессией.

## 5.4 DB protection

Использовать минимум:
- application-level tenant filters;
- automated tests на cross-tenant leakage.

Желательно:
- PostgreSQL RLS как второй слой защиты.

---

# 6. Общие соглашения по данным

Во всех основных сущностях:

```text
id
tenant_id
created_at
created_by
updated_at
updated_by
version
```

Для soft-deletable:

```text
archived_at
archived_by
```

Не использовать `deleted_at` там, где юридически/медицински корректнее понятие архивирования или отмены.

## Concurrency

Использовать optimistic locking:

```text
version INTEGER
```

для:
- appointment;
- treatment plan;
- payment drafts;
- clinical notes;
- inventory documents.

---

# 7. Домен 01 — Platform

Назначение:
- SaaS-tenant management;
- тарифы;
- feature flags;
- настройки;
- usage limits.

Таблицы:

```text
tenants
tenant_settings
tenant_features

plans
plan_features
subscriptions
subscription_events

usage_counters
feature_flags
```

Не смешивать SaaS billing с финансами клиники.

---

# 8. Домен 02 — Organizations

Таблицы:

```text
organizations
branches
departments
rooms
chairs

organization_settings
branch_settings
```

Chair — самостоятельный ресурс.

Это позволяет считать:
- загрузку кресел;
- выручку;
- простой;
- себестоимость;
- utilization.

---

# 9. Домен 03 — Identity & Access

Разделять:

```text
User
```

и:

```text
Employee
```

`User` — учётная запись.

`Employee` — сотрудник клиники.

Таблицы:

```text
users
memberships

roles
permissions
role_permissions
membership_roles

access_scopes
user_sessions
mfa_settings
```

Подход:

```text
RBAC + ABAC
```

Пример:

```text
doctor:
  patient.read = assigned_or_branch
  clinical.write = own_encounter
  finance.read = false
  compensation.read = own
```

Permission keys:

```text
patients.read
patients.create
patients.update
patients.merge
patients.export

appointments.read
appointments.create
appointments.update
appointments.cancel
appointments.modify_past

clinical.read
clinical.write
clinical.sign
clinical.amend

finance.read
finance.payment.create
finance.payment.refund
finance.ledger.adjust

inventory.read
inventory.receive
inventory.transfer
inventory.writeoff
inventory.adjust

compensation.read_own
compensation.read_all
compensation.calculate
compensation.approve

audit.read
settings.manage
integrations.manage
```

---

# 10. Домен 04 — Employees

Таблицы:

```text
employees
employee_branches
employee_specialties
employee_qualifications
employee_documents

doctors
assistants

work_contracts
```

Один employee может работать в нескольких branches.

Doctor/assistant — role-specific profile, не отдельная копия человека.

---

# 11. Домен 05 — Compensation

Полноценный Compensation Engine.

Таблицы:

```text
compensation_rules
compensation_rule_versions
compensation_rule_conditions

payroll_periods
payroll_accruals
payroll_adjustments
payroll_approvals

timesheets
time_entries
```

Поддержать:

```text
percentage
fixed amount
hourly
salary
formula
```

База расчёта:

```text
gross_service_amount
net_after_discount
net_after_acquiring
net_after_materials
net_after_laboratory
custom
```

Правила могут зависеть от:
- сотрудника;
- специальности;
- услуги;
- группы услуг;
- филиала;
- типа оплаты;
- даты действия.

Каждое начисление должно сохранять snapshot правила, чтобы изменение будущих правил не изменяло прошлую зарплату.

---

# 12. Домен 06 — Patients

Таблицы:

```text
patients
patient_identifiers

patient_contacts
patient_addresses

patient_tags
patient_tag_links

patient_alerts
patient_allergies

patient_family_links
patient_representatives

patient_consents
patient_preferences

patient_sources

patient_merges
patient_archive_events
```

## Patient identifiers

Не ограничиваться только ИИН.

```text
type:
  IIN
  PASSPORT
  EXTERNAL
```

ИИН:

```text
identifier_encrypted
identifier_hash
last4
```

`identifier_hash` использовать для дедупликации.

## Duplicate detection

Поиск возможного дубля:
- exact IIN;
- нормализованный телефон;
- ФИО + дата рождения;
- fuzzy ФИО + телефон.

Объединение должно:
- требовать permission;
- создавать `patient_merge`;
- сохранять alias старого patient id;
- не уничтожать audit history.

---

# 13. Домен 07 — CRM

Это принципиальное улучшение относительно модели «пациент + источник».

Сущности:

```text
leads
lead_sources
lead_channels

opportunities
opportunity_stages
opportunity_stage_history

crm_activities
crm_notes
```

Связи:

```text
Lead
 ↓ convert
Patient
 ↓
Opportunity
 ↓
TreatmentPlan
```

Opportunity должна уметь ссылаться на `treatment_plan_id`.

Основные стадии configurable:

```text
new
contacted
appointment_booked
visited
plan_created
plan_presented
accepted
in_treatment
won
lost
```

Причина потери обязательна для `lost`.

Метрики:
- lead → booking;
- booking → visit;
- visit → plan;
- plan → acceptance;
- accepted value;
- realized value.

---

# 14. Домен 08 — Workflow & Tasks

Универсальный механизм задач и автоматизаций.

Таблицы:

```text
tasks
task_comments
task_status_history

workflow_rules
workflow_rule_conditions
workflow_rule_actions
workflow_runs
workflow_run_logs
```

Event:

```text
PatientNoShow
```

Rule:

```text
after 30 minutes
```

Action:

```text
create task for administrator
```

Поддерживаемые actions v1:

```text
CREATE_TASK
SEND_NOTIFICATION
SEND_MESSAGE
ADD_TAG
REMOVE_TAG
CREATE_RECALL
UPDATE_OPPORTUNITY_STAGE
```

Не давать workflow engine произвольно выполнять SQL/code.

---

# 15. Домен 09 — Scheduling

Таблицы:

```text
appointments
appointment_services
appointment_notes

appointment_status_events

schedule_templates
schedule_shifts
schedule_breaks
schedule_exceptions

resource_reservations
```

Appointment:

```text
patient_id
doctor_id
branch_id
room_id
chair_id
starts_at
ends_at
status
source
reason
notes
```

## State machine

```text
created
awaiting_confirmation
confirmed
checked_in
in_progress
completed
cancelled
no_show
rescheduled
```

`late` лучше хранить как operational flag/event, а не обязательный terminal state.

Каждая смена статуса создаёт `appointment_status_event`.

## Conflict engine

Нельзя сохранить appointment при конфликте:
- doctor;
- chair;
- room/resource;

если нет explicit override permission.

---

# 16. Домен 10 — Recall & Waitlist

## Recall

Таблицы:

```text
recall_types
recalls
recall_attempts
```

Пример:

```text
Professional cleaning
interval = 180 days
```

Status:

```text
scheduled
due
contacted
booked
completed
cancelled
```

## Waitlist

```text
waitlist_entries
waitlist_preferences
waitlist_offers
```

Preferences:
- doctors;
- specialties;
- branches;
- date range;
- days of week;
- time ranges;
- minimum notice.

Smart matching:

```text
AppointmentCancelled
 ↓
Find compatible waitlist entries
 ↓
Create offers
 ↓
Notify candidates
 ↓
First valid confirmation reserves slot
```

Бронирование должно быть atomic, чтобы два пациента не заняли одно окно.

---

# 17. Домен 11 — Clinical EMR

Таблицы:

```text
encounters

clinical_notes
clinical_note_versions

complaints
anamnesis_entries
clinical_observations

diagnoses
encounter_diagnoses

procedures
procedure_status_events

medical_alerts
prescriptions
recommendations
```

`appointment` ≠ `encounter`.

Appointment — организационная запись.

Encounter — медицинский факт приёма.

Один appointment обычно создаёт один encounter, но связь не должна быть жёсткой 1:1 на уровне концепции.

## Signed clinical records

После подписи:

```text
clinical_note.status = signed
```

редактирование исходной версии запрещено.

Исправление:

```text
ClinicalNoteAmendment
```

с:
- previous version;
- new version;
- author;
- reason;
- timestamp.

---

# 18. Домен 12 — Odontogram

Не хранить odontogram только картинкой.

Таблицы:

```text
odontograms
odontogram_entries
odontogram_entry_versions
tooth_conditions
```

Entry:

```text
patient_id
tooth_number
surface
condition_code
status
observed_at
encounter_id
doctor_id
```

Surface:

```text
whole
occlusal
mesial
distal
buccal
lingual
root
```

История зуба должна строиться из entries.

---

# 19. Домен 13 — Treatment Plans

Таблицы:

```text
treatment_plans
treatment_plan_versions

treatment_plan_stages
treatment_plan_items

treatment_plan_presentations
treatment_plan_acceptances

treatment_plan_item_executions
```

Status:

```text
draft
presented
partially_accepted
accepted
in_progress
completed
rejected
cancelled
```

Treatment plan item:

```text
service_id
tooth_number
quantity
list_price
discount
final_price
doctor_id
estimated_cost
status
```

После представления пациенту сохранить immutable snapshot цен.

## Acceptance analytics

Считать:

```text
proposed_amount
accepted_amount
realized_amount

acceptance_rate
realization_rate
```

CRM opportunity может ссылаться на treatment plan.

---

# 20. Домен 14 — Laboratory

Таблицы:

```text
laboratories
lab_cases
lab_case_items
lab_case_status_events
lab_case_files
lab_invoices
```

Status:

```text
ordered
impression_taken
sent
in_production
received
fitted
completed
rework
cancelled
```

Поля:

```text
expected_at
sent_at
received_at
cost
responsible_doctor_id
```

---

# 21. Домен 15 — Imaging

Таблицы:

```text
imaging_studies
imaging_files
imaging_annotations
imaging_links
```

Поддержка:
- photo;
- X-ray;
- CT;
- intraoral image;
- DICOM metadata.

Файлы — object storage.

В БД хранить metadata и references.

Архитектурно предусмотреть DICOM/PACS adapter.

---

# 22. Домен 16 — Documents

Таблицы:

```text
document_templates
document_template_versions

documents
document_versions

document_signatures
document_delivery_events
```

Шаблоны поддерживают variables:

```text
{{patient.full_name}}
{{patient.iin}}
{{doctor.full_name}}
{{appointment.date}}
{{treatment_plan.total}}
```

После подписания документ immutable.

Поддержать:
- patient signature;
- employee signature;
- ЭЦП adapter.

---

# 23. Домен 17 — Insurance

Даже если не входит в первый релиз, модель заложить сразу.

Таблицы:

```text
insurance_companies
insurance_plans
insurance_price_lists
insurance_price_list_items

patient_policies

insurance_claims
insurance_claim_items
insurance_claim_events
insurance_payments
```

Поток:

```text
Procedure
 ↓
Claim draft
 ↓
Submitted
 ↓
Approved / Partially Approved / Rejected
 ↓
Insurance payment
```

---

# 24. Домен 18 — Finance

Finance должен быть основан на **ledger**, а не на поле `patient.balance`.

## Tables

```text
financial_accounts

ledger_transactions
ledger_entries

charges
charge_items

payments
payment_allocations

refunds
refund_allocations

patient_deposits
deposit_allocations

cashboxes
cash_sessions
cash_transactions

expense_categories
expenses
```

## Double-entry style

Каждая финансовая операция создаёт balanced transaction.

Пример лечение 100 000:

```text
Patient receivable +100000
Revenue            +100000
```

Оплата 70 000:

```text
Cash/Bank           +70000
Patient receivable  -70000
```

Остаток долга выводится из ledger projection.

## Mixed payments

Одна оплата приёма:

```text
40 000 Kaspi
30 000 Cash
20 000 Deposit
10 000 Debt
```

Должна поддерживаться штатно.

## Immutable finance

Проведённую транзакцию нельзя исправлять UPDATE.

Исправление создаётся:
- reversal;
- adjustment;
- refund.

---

# 25. Домен 19 — Inventory

Таблицы:

```text
products
product_categories
units_of_measure
product_barcodes

warehouses
warehouse_locations

product_batches

stock_documents
stock_document_lines

stock_movements

suppliers
purchase_receipts
purchase_receipt_lines

stock_transfers
stock_writeoffs

stocktakes
stocktake_lines

service_material_recipes
service_material_recipe_items

stock_alerts
```

## Партионный учёт

Batch:

```text
lot_number
manufactured_at
expires_at
purchase_price
quantity
```

## FEFO

При автоматическом списании предпочитать:

```text
First Expired — First Out
```

## Stock source of truth

Остаток:

```text
SUM(stock_movements.quantity_delta)
```

Не редактировать `current_quantity` вручную как источник истины.

## Service recipe

Пример:

```text
Treatment of caries

Composite      0.3 g
Anesthetic     1 cartridge
Gloves         2 pcs
```

При `ProcedureCompleted`:
- создать planned consumption;
- разрешить сотруднику подтвердить/скорректировать фактический расход;
- после подтверждения создать stock movements.

---

# 26. Домен 20 — Communications

Единый communication timeline пациента.

Таблицы:

```text
conversations
conversation_participants
messages

message_templates
message_template_versions

calls
call_events
call_recordings

notification_jobs
notification_deliveries

communication_preferences
```

Channels:

```text
WHATSAPP
SMS
EMAIL
PUSH
PHONE
IN_APP
```

Provider abstraction:

```ts
interface MessagingProvider {
  send(...)
  getStatus(...)
}
```

Не привязывать domain к конкретному WhatsApp API.

---

# 27. Домен 21 — Marketing & Loyalty

## Marketing

```text
marketing_sources
campaigns
utm_attributions

marketing_costs
conversion_events

patient_segments
segment_rules
```

Цепочка атрибуции:

```text
Campaign
→ Lead
→ Appointment
→ Visit
→ Treatment Plan
→ Accepted
→ Revenue
```

Метрики:
- CPL;
- booking rate;
- visit rate;
- treatment acceptance;
- revenue;
- ROAS.

## Loyalty

```text
loyalty_programs
loyalty_rules

bonus_accounts
bonus_transactions

coupons
promotions
```

Bonus balance также строить из transactions.

---

# 28. Домен 22 — Analytics

Не строить управленческие отчёты прямыми тяжёлыми JOIN из production UI.

Создавать projections/read models.

Основные наборы:

```text
appointment_daily_metrics
doctor_daily_metrics
chair_daily_metrics

patient_financial_summary

treatment_acceptance_metrics

marketing_funnel_metrics

inventory_consumption_metrics

payroll_summary
```

Dashboard директора:

```text
Revenue
Collections
Receivables
New patients
Repeat patients
No-show rate
Chair utilization
Doctor utilization
Treatment acceptance
Average treatment value
Material cost
Payroll %
Contribution margin
Marketing ROAS
```

## Chair economics

```text
chair available hours
chair occupied hours
utilization

revenue
doctor compensation
assistant compensation
materials
laboratory
acquiring

contribution margin
```

---

# 29. Домен 23 — Integrations

Создать единый integration framework.

Таблицы:

```text
integration_connections
integration_credentials
integration_events
integration_webhooks
integration_sync_states
integration_errors
```

Provider types:

```text
IdentityProvider
GovernmentProvider
MessagingProvider
TelephonyProvider
PaymentProvider
AccountingProvider
ImagingProvider
LaboratoryProvider
SignatureProvider
AnalyticsProvider
```

Пример:

```ts
interface IdentityProvider {
  lookupByIdentifier(identifier: string): Promise<PersonIdentityResult>;
}
```

Реализации:

```text
GovernmentIdentityProvider
OcrIdentityProvider
ManualIdentityProvider
```

Нельзя, чтобы `PatientsService` знал детали конкретного государственного API.

---

# 30. Government Integration — Kazakhstan

Выделить отдельный технический модуль:

```text
government
```

Ответственность:
- государственные медицинские цифровые системы;
- интеграции через внешние шлюзы;
- идентификация;
- контроль доступа к персональным данным;
- ЭЦП;
- будущие СУР/е-Денсаулық/другие контуры.

Структура:

```text
government/
  providers/
  adapters/
  dto/
  signing/
  consent/
  sync/
  audit/
```

Все outbound payloads должны:
- логироваться безопасно;
- иметь correlation id;
- иметь retry policy;
- иметь dead-letter/error state;
- не содержать чувствительные поля в обычных application logs.

---

# 31. Patient Portal

Отдельное frontend-приложение или route-space.

Функции:

```text
registration/login
profile

upcoming appointments
appointment history

online booking
reschedule/cancel

treatment plans
documents
payments
debts/deposits

images/medical data where permitted

messages
digital intake
consents
```

---

# 32. Family Accounts

Таблицы:

```text
portal_accounts
portal_patient_links
legal_representative_links
```

Один аккаунт может иметь доступ к:
- себе;
- ребёнку;
- представляемому пациенту;

только при наличии подтверждённого основания/разрешения.

Нельзя реализовывать семейный доступ просто по совпадению телефона.

---

# 33. Online Booking

Сущности:

```text
booking_rules
public_booking_slots
booking_requests
```

Booking engine учитывает:
- branch;
- doctor;
- specialty;
- service duration;
- chair/resource;
- schedule;
- blocked intervals.

Public frontend не должен сам рассчитывать доступность из полного расписания.

Backend возвращает только разрешённые slots.

---

# 34. Digital Intake + OCR

Flow:

```text
Patient opens secure link
 ↓
fills questionnaire
 ↓
uploads ID/photo if needed
 ↓
OCR extraction
 ↓
patient confirms extracted data
 ↓
duplicate check
 ↓
staff review / auto-attach according to policy
```

Таблицы:

```text
intake_forms
intake_form_versions
intake_submissions

ocr_jobs
ocr_results
```

OCR никогда не должен молча перезаписывать уже подтверждённые персональные данные.

---

# 35. Reviews & Reputation

```text
review_requests
review_feedback
review_destinations
```

Flow:

```text
AppointmentCompleted
 ↓ delay
Internal rating
 ↓
good → suggest public review
bad  → create service recovery task
```

Не использовать манипулятивное скрытие негативных отзывов; внутренняя обратная связь должна служить обработке проблемы.

---

# 36. AI Layer

AI — поперечный слой, но не источник медицинской истины.

Таблицы:

```text
ai_jobs
ai_outputs
ai_feedback
ai_prompt_versions
```

## AI Medical Scribe

Input:
- аудио/диктовка;
- контекст encounter.

Output draft:

```text
complaints
anamnesis
objective findings
draft diagnosis
recommendations
```

Врач обязан:
- просмотреть;
- изменить при необходимости;
- подтвердить;
- подписать.

AI output хранится отдельно от signed medical record до подтверждения.

## AI Treatment Explanation

Генерирует пациентское объяснение утверждённого врачом плана.

AI не меняет plan items.

## No-show risk

Модель может учитывать:
- lead time;
- previous no-shows;
- day/time;
- confirmations;
- reschedules.

Результат используется как подсказка, а не как основание отказать пациенту.

## AI inventory forecasting

Рекомендация закупки по истории расхода.

Никаких автоматических заказов поставщику без отдельного подтверждения.

---

# 37. Domain Events

Базовые события:

```text
PatientCreated
PatientMerged

LeadCreated
LeadConverted
OpportunityStageChanged

AppointmentCreated
AppointmentConfirmed
AppointmentCheckedIn
AppointmentStarted
AppointmentCompleted
AppointmentCancelled
PatientNoShow

EncounterStarted
EncounterCompleted
ClinicalNoteSigned

TreatmentPlanCreated
TreatmentPlanPresented
TreatmentPlanAccepted
TreatmentPlanItemCompleted

ProcedureCompleted

PaymentPosted
PaymentRefunded
DepositCreated

InventoryReceived
InventoryConsumed
StockBelowMinimum
BatchExpiringSoon

PayrollCalculated
PayrollApproved

LabCaseCreated
LabCaseReceived

RecallDue
WaitlistSlotAvailable
```

---

# 38. Transactional Outbox

Не публиковать важные события после commit «вручную» без гарантии.

Использовать:

```text
outbox_events
```

В одной DB transaction:

```text
update business data
insert outbox event
commit
```

Worker:
- читает outbox;
- доставляет handler;
- отмечает processed.

Handlers должны быть idempotent.

---

# 39. Audit

Audit — отдельная подсистема.

Таблицы/хранилища:

```text
audit_events
security_events
```

Audit event:

```text
id
tenant_id
actor_user_id
actor_employee_id

action
entity_type
entity_id

before_snapshot
after_snapshot

reason
ip
user_agent
request_id

created_at
hash
```

Для чувствительных сущностей:
- patient merge;
- clinical note;
- payment;
- refund;
- payroll;
- stock adjustment;
- permission change;

audit обязателен.

Пользователь с `audit.read` может читать, но обычный app admin не должен иметь возможность удалять audit.

Для соответствия требованиям Казахстана предусмотреть выгрузку/хранение журналов на отдельном специализированном log storage с immutable/WORM-подходом.

---

# 40. Security

Минимум:

- MFA для сотрудников;
- short-lived access tokens;
- rotating refresh tokens;
- session revocation;
- RBAC + ABAC;
- encryption in transit;
- encryption at rest;
- field encryption для наиболее чувствительных identifiers;
- secret manager;
- IP/device/session audit;
- rate limits;
- brute-force protection;
- CSRF protection при cookie auth;
- CSP;
- secure file upload;
- malware scan;
- signed temporary URLs для файлов;
- backups;
- restore tests.

## Sensitive logs

Нельзя писать в обычный log:

```text
ИИН
полные медицинские записи
полные документы
пароли
access tokens
private keys
```

---

# 41. Требования Казахстана, которые учитывать архитектурно

На дату этого документа действующие минимальные требования к медицинским цифровым системам Республики Казахстан предусматривают, в частности:

- использование на территории РК МЦС, соответствующих минимальным требованиям;
- поставщика МЦС — резидента Республики Казахстан;
- передачу предусмотренных клинических/административных данных в цифровые системы уполномоченного органа;
- настройку уровней доступа к персональным медицинским данным;
- MFA/цифровую аутентификацию для предусмотренных сценариев;
- размещение программно-аппаратного обеспечения МЦС на территории Казахстана;
- role-based разграничение доступа;
- журналирование событий и действий пользователей;
- неизменяемое хранение журналов;
- поддержку ЭЦП;
- возможность интеграции с медицинским оборудованием, включая HL7/DICOM;
- хранение персональных медицинских данных на серверах, физически расположенных на территории РК.

Официальные источники для юридической проверки перед production:
- https://adilet.zan.kz/rus/docs/V2100023926
- https://adilet.zan.kz/rus/docs/V2100022550

**Важно:** этот документ — архитектурная спецификация, а не юридическое заключение. Перед промышленным запуском требования необходимо перепроверить на актуальную дату и провести security/compliance review.

---

# 42. API Architecture

Base:

```text
/api/v1
```

Примеры:

```text
GET    /patients
POST   /patients
GET    /patients/:id
PATCH  /patients/:id

POST   /patients/:id/merge

GET    /appointments
POST   /appointments
POST   /appointments/:id/confirm
POST   /appointments/:id/check-in
POST   /appointments/:id/start
POST   /appointments/:id/complete
POST   /appointments/:id/cancel

POST   /encounters
POST   /clinical-notes/:id/sign
POST   /clinical-notes/:id/amend

POST   /treatment-plans
POST   /treatment-plans/:id/present
POST   /treatment-plans/:id/accept

POST   /payments
POST   /payments/:id/refund

POST   /stock/receipts
POST   /stock/transfers
POST   /stock/writeoffs
POST   /stocktakes

GET    /analytics/director-dashboard
```

Command endpoints предпочтительнее универсального PATCH, если операция имеет бизнес-смысл.

Например:

```text
POST /appointments/:id/cancel
```

лучше, чем:

```text
PATCH /appointments/:id
{ status: "cancelled" }
```

потому что cancel требует:
- причины;
- permissions;
- audit;
- event;
- waitlist handling.

---

# 43. API errors

Единый формат:

```json
{
  "error": {
    "code": "APPOINTMENT_RESOURCE_CONFLICT",
    "message": "Selected chair is already occupied",
    "details": {},
    "requestId": "..."
  }
}
```

Не возвращать бизнес-логику только строками.

Frontend должен ориентироваться на `error.code`.

---

# 44. Idempotency

Обязательно для:

```text
payments
refunds
government submissions
external webhooks
message sending
public booking confirmation
```

Поддержать:

```text
Idempotency-Key
```

---

# 45. Realtime

Realtime нужен для:

```text
calendar changes
patient checked-in
doctor notification
tasks
incoming messages
waitlist booking
```

Рекомендуется WebSocket gateway.

События frontend:

```text
appointment.updated
appointment.checked_in
message.received
task.created
```

Frontend всё равно должен уметь пересинхронизироваться через REST после reconnect.

---

# 46. Customization

Не разрешать customer-specific source code forks.

Поддержать:

```text
custom fields
custom tags
custom appointment statuses display settings
workflow rules
document templates
message templates
price lists
compensation rules
roles
permissions
feature flags
branding
```

Custom fields:

```text
custom_field_definitions
custom_field_values
```

Но критические медицинские и финансовые поля должны оставаться typed schema.

---

# 47. Price Lists & Services

Не выделено отдельным доменом, но является shared catalog.

Таблицы:

```text
service_categories
services

price_lists
price_list_items

service_durations
service_specialties

service_material_recipes
```

Service должен иметь stable code.

Цена услуги — не поле в service, а versioned price list item.

Это позволяет:
- разные филиалы;
- страховые цены;
- акции;
- историю цен.

---

# 48. Accounting integration / 1С

Не пытаться превращать систему в полноценную бухгалтерию.

Хранить операционный управленческий учёт.

Для бухгалтерии:

```text
AccountingProvider
```

Экспорт:
- sales;
- payments;
- refunds;
- cash expenses;
- payroll accruals;
- inventory documents при необходимости.

Создать staging:

```text
accounting_export_batches
accounting_export_items
accounting_sync_errors
```

Интеграция должна быть повторяемой/idempotent.

---

# 49. Search

Global patient search:

По:
- IIN;
- phone;
- ФИО;
- patient code.

Использовать normalized fields:

```text
full_name_search
phone_normalized
identifier_hash
```

Нельзя делать дешифровку всех ИИН для поиска.

---

# 50. Timezones

Хранить timestamps в UTC.

Tenant/branch имеет:

```text
timezone
```

UI отображает local time филиала.

Schedule logic должна учитывать timezone branch.

---

# 51. Money

Все суммы:

```text
NUMERIC(18,2)
currency_code
```

Не использовать float.

Для Казахстана default:

```text
KZT
```

но schema должна позволять currency.

---

# 52. Localization

Минимум:

```text
ru-KZ
kk-KZ
```

Архитектурно:
- UI i18n;
- templates per locale;
- document templates per locale;
- reference data localization.

---

# 53. Soft delete / retention

## Нельзя hard delete

- patients;
- encounters;
- clinical notes;
- treatment plans;
- payments;
- ledger;
- stock movements;
- audit.

Использовать:
- archive;
- cancel;
- reverse;
- supersede.

Hard delete допустим только для технических draft/temporary объектов по правилам retention.

---

# 54. Backups / Disaster Recovery

Обязательно:

- automated PostgreSQL backups;
- point-in-time recovery;
- object storage backups/versioning;
- off-node copy;
- регулярный restore test.

Документировать:

```text
RPO
RTO
```

Целевой ориентир после выхода в production:

```text
RPO <= 15 min
RTO <= 4 h
```

Конкретные значения утвердить отдельно.

---

# 55. Testing Strategy

Каждый модуль:

## Unit tests
Бизнес-правила.

## Integration tests
DB + module.

## Contract tests
Integrations.

## E2E
Критические сценарии.

Обязательные E2E:

```text
patient create → appointment → encounter → procedure → payment
```

```text
appointment cancellation → waitlist offer → booking
```

```text
treatment plan → patient accepts partially → procedures
```

```text
procedure → material consumption
```

```text
procedure → doctor compensation accrual
```

```text
payment → refund
```

```text
patient merge
```

```text
cross-tenant access rejected
```

```text
signed clinical note cannot be silently edited
```

---

# 56. Database constraints

Не полагаться только на application validation.

Примеры:

```text
CHECK ends_at > starts_at
CHECK amount >= 0
UNIQUE tenant-scoped codes
FOREIGN KEY
NOT NULL
```

Использовать DB transaction для:
- booking;
- payments;
- refunds;
- inventory posting;
- payroll approval;
- patient merge.

---

# 57. Observability

Каждый request:

```text
request_id
trace_id
tenant_id
user_id
```

Но без sensitive medical content.

Metrics:

```text
API latency
5xx rate
DB latency
queue depth
failed jobs
external integration latency
government sync errors
message delivery failure rate
```

---

# 58. Feature Flags

Feature flags tenant-aware:

```text
insurance
patient_portal
ai_scribe
government_integration
loyalty
advanced_inventory
```

Это позволит выпускать функции постепенно.

---

# 59. UI architecture

Основные рабочие разделы:

```text
Dashboard
Calendar
Patients
CRM
Tasks
Doctors
Clinical
Treatment Plans
Laboratory
Finance
Inventory
Payroll
Marketing
Reports
Documents
Integrations
Settings
Audit
```

## Calendar

Главный операционный экран.

Нужны views:
- day;
- week;
- doctors;
- chairs;
- rooms.

Appointment card:
- patient;
- status;
- service;
- phone;
- alerts;
- balance indicator;
- confirmation;
- source;
- chair.

Drag/drop должен вызывать backend reschedule command с conflict validation.

---

# 60. Director Dashboard

Показывать не просто выручку.

Блоки:

```text
Today
Revenue
Collections
Visits
New patients
No-shows

Treatment
Plans proposed
Plans accepted
Acceptance rate
Realized amount

Resources
Doctor utilization
Chair utilization

Finance
Receivables
Deposits
Cash

Profitability
Materials %
Payroll %
Laboratory %
Contribution margin

Marketing
Leads
Bookings
Visits
Revenue
ROAS
```

---

# 61. MVP boundaries

MVP не должен содержать все функции.

Первый usable release должен позволять клинике:

```text
создать организацию/филиал
создать сотрудников
настроить права
создать пациента
вести расписание
провести прием
заполнить медкарту
создать план лечения
оказать услуги
принять оплату
увидеть долг/депозит
получить базовые отчеты
увидеть аудит
```

---

# 62. Этапы реализации

## Phase 0 — Foundation

Реализовать:

```text
monorepo
CI/CD
Docker

PostgreSQL
Redis
Object Storage

Auth
Tenant
Organization
Branch

RBAC
Audit

Outbox
Job worker

Observability baseline
```

Acceptance:
- tenant isolation verified;
- login/MFA architecture ready;
- audit works;
- sample event via outbox works.

---

## Phase 1 — Clinic Core

```text
Employees
Doctors
Rooms
Chairs
Services
Price lists

Patients

Schedules
Appointments
Calendar
Appointment state machine
```

Acceptance:
- клиника может полностью вести расписание;
- конфликты врача/кресла предотвращаются;
- действия журналируются.

---

## Phase 2 — Clinical Core

```text
Encounters
Clinical notes + versions
Diagnoses
Procedures
Odontogram
Treatment plans
Documents/files
```

Acceptance:
- врач может провести приём от начала до подписанной медицинской записи;
- история изменений не теряется;
- план лечения связан с пациентом и процедурами.

---

## Phase 3 — Finance

```text
Ledger
Charges
Payments
Mixed payments
Deposits
Debts
Refunds
Cashboxes
Expenses
```

Acceptance:
- баланс пациента всегда восстанавливается из ledger;
- refund создаёт обратные проводки;
- проведённые операции нельзя silently update.

---

## Phase 4 — CRM + Workflow

```text
Leads
Opportunities
Treatment-plan linked deals

Tasks
Workflow rules
Triggers

Communication timeline
```

Acceptance:
- lead проходит до пациента/сделки;
- план лечения связан с opportunity;
- события создают автоматические задачи.

---

## Phase 5 — Recall + Waitlist

```text
Recall
Waitlist
Smart slot offers
Patient self-booking link
```

Acceptance:
- освобождение окна находит совместимых пациентов;
- нельзя дважды занять один слот;
- recall автоматически создаётся по заданному правилу.

---

## Phase 6 — Inventory

```text
Products
Warehouses
Batches
Receipts
Transfers
Writeoffs
Stocktake
Service recipes
Auto-consumption
Expiration alerts
```

Acceptance:
- остатки считаются из movements;
- FEFO работает;
- завершённая процедура может сформировать расход материалов.

---

## Phase 7 — Compensation

```text
Rules
Timesheets
Accruals
Adjustments
Payroll periods
Approval
```

Acceptance:
- прошлый payroll не меняется после изменения правила;
- возможен расчёт %/fixed/hourly;
- видимость зарплаты регулируется permissions.

---

## Phase 8 — Patient Experience

```text
WhatsApp/SMS provider
Templates
Notifications

Patient Portal
Online booking
Digital intake
OCR
Family access

Reviews
```

Acceptance:
- patient portal работает без доступа к staff UI;
- online booking соблюдает resource conflicts;
- OCR требует подтверждения результата.

---

## Phase 9 — Laboratory + Insurance + Loyalty

```text
Lab cases
Insurance
Bonus system
Promotions
```

---

## Phase 10 — Kazakhstan Integrations

```text
Government Integration
identity lookup
consent/access services
digital signature
required clinical/admin data exchange
```

Делать по актуальным официальным спецификациям конкретных государственных систем.

---

## Phase 11 — Advanced Analytics

```text
Treatment acceptance
Chair economics
Contribution margin
Marketing attribution
ROAS
Inventory analytics
```

---

## Phase 12 — AI

```text
AI scribe
Treatment explanation
No-show risk
Inventory forecast
```

Только после появления качественного доменного ядра и данных.

---

# 63. Definition of Done для каждого домена

Функция не считается реализованной, пока нет:

- DB migration;
- domain entity/model;
- repository;
- service/use-case;
- validation;
- permission;
- audit;
- API;
- OpenAPI description;
- tests;
- frontend;
- error handling;
- analytics/event hook where required;
- localization strings;
- docs.

---

# 64. Architecture Decision Records

Все крупные решения фиксировать в:

```text
/docs/architecture/adr
```

Примеры:

```text
0001-modular-monolith.md
0002-multi-tenancy.md
0003-ledger-finance.md
0004-clinical-versioning.md
0005-outbox.md
0006-auth.md
```

---

# 65. Запрещённые анти-паттерны

Не делать:

```text
patient.balance = patient.balance + payment
```

Вместо этого — ledger.

Не делать:

```text
UPDATE clinical_note
```

после подписи.

Не делать:

```text
appointment.status = ...
```

мимо state-machine command.

Не делать:

```text
inventory.current_stock -= x
```

как единственный источник истины.

Не делать:

```text
if tenant == "clinic_123":
   special logic
```

Использовать configurable rules/features.

Не делать:
- generic admin bypass всех ограничений;
- hard-coded WhatsApp vendor;
- hard-coded IIN vendor;
- hard-coded government endpoint внутри PatientService;
- direct frontend DB writes для clinical/finance;
- хранение PDF/рентгена в Postgres bytea без необходимости;
- использование float для денег;
- cron job без idempotency для финансовых/медицинских событий.

---

# 66. Первичный каталог таблиц

Ниже ориентир. Названия могут корректироваться при детализации, но доменные границы сохранять.

```text
# PLATFORM
tenants
tenant_settings
tenant_features
plans
plan_features
subscriptions
subscription_events
usage_counters
feature_flags

# ORGANIZATION
organizations
branches
departments
rooms
chairs
organization_settings
branch_settings

# IDENTITY
users
memberships
roles
permissions
role_permissions
membership_roles
access_scopes
user_sessions
mfa_settings

# EMPLOYEE
employees
employee_branches
employee_specialties
employee_qualifications
employee_documents
doctors
assistants
work_contracts

# COMPENSATION
compensation_rules
compensation_rule_versions
compensation_rule_conditions
payroll_periods
payroll_accruals
payroll_adjustments
payroll_approvals
timesheets
time_entries

# PATIENT
patients
patient_identifiers
patient_contacts
patient_addresses
patient_tags
patient_tag_links
patient_alerts
patient_allergies
patient_family_links
patient_representatives
patient_consents
patient_preferences
patient_sources
patient_merges
patient_archive_events

# CRM
leads
lead_sources
lead_channels
opportunities
opportunity_stages
opportunity_stage_history
crm_activities
crm_notes

# WORKFLOW
tasks
task_comments
task_status_history
workflow_rules
workflow_rule_conditions
workflow_rule_actions
workflow_runs
workflow_run_logs

# SCHEDULING
appointments
appointment_services
appointment_notes
appointment_status_events
schedule_templates
schedule_shifts
schedule_breaks
schedule_exceptions
resource_reservations

# RECALL
recall_types
recalls
recall_attempts
waitlist_entries
waitlist_preferences
waitlist_offers

# CLINICAL
encounters
clinical_notes
clinical_note_versions
complaints
anamnesis_entries
clinical_observations
diagnoses
encounter_diagnoses
procedures
procedure_status_events
medical_alerts
prescriptions
recommendations

# ODONTOGRAM
odontograms
odontogram_entries
odontogram_entry_versions
tooth_conditions

# TREATMENT
treatment_plans
treatment_plan_versions
treatment_plan_stages
treatment_plan_items
treatment_plan_presentations
treatment_plan_acceptances
treatment_plan_item_executions

# LAB
laboratories
lab_cases
lab_case_items
lab_case_status_events
lab_case_files
lab_invoices

# IMAGING
imaging_studies
imaging_files
imaging_annotations
imaging_links

# DOCUMENTS
document_templates
document_template_versions
documents
document_versions
document_signatures
document_delivery_events

# INSURANCE
insurance_companies
insurance_plans
insurance_price_lists
insurance_price_list_items
patient_policies
insurance_claims
insurance_claim_items
insurance_claim_events
insurance_payments

# FINANCE
financial_accounts
ledger_transactions
ledger_entries
charges
charge_items
payments
payment_allocations
refunds
refund_allocations
patient_deposits
deposit_allocations
cashboxes
cash_sessions
cash_transactions
expense_categories
expenses

# CATALOG
service_categories
services
price_lists
price_list_items
service_durations
service_specialties

# INVENTORY
products
product_categories
units_of_measure
product_barcodes
warehouses
warehouse_locations
product_batches
stock_documents
stock_document_lines
stock_movements
suppliers
purchase_receipts
purchase_receipt_lines
stock_transfers
stock_writeoffs
stocktakes
stocktake_lines
service_material_recipes
service_material_recipe_items
stock_alerts

# COMMUNICATIONS
conversations
conversation_participants
messages
message_templates
message_template_versions
calls
call_events
call_recordings
notification_jobs
notification_deliveries
communication_preferences

# MARKETING
marketing_sources
campaigns
utm_attributions
marketing_costs
conversion_events
patient_segments
segment_rules

# LOYALTY
loyalty_programs
loyalty_rules
bonus_accounts
bonus_transactions
coupons
promotions

# INTEGRATIONS
integration_connections
integration_credentials
integration_events
integration_webhooks
integration_sync_states
integration_errors

# ACCOUNTING
accounting_export_batches
accounting_export_items
accounting_sync_errors

# PORTAL / INTAKE
portal_accounts
portal_patient_links
legal_representative_links
booking_rules
public_booking_slots
booking_requests
intake_forms
intake_form_versions
intake_submissions
ocr_jobs
ocr_results

# REVIEWS
review_requests
review_feedback
review_destinations

# AI
ai_jobs
ai_outputs
ai_feedback
ai_prompt_versions

# PLATFORM EVENTS / AUDIT
outbox_events
audit_events
security_events
```

Ориентировочно получается **150+ таблиц**, но это нормально для зрелой ERP/CRM/МИС. Не создавать их все в первой миграции: вводить доменами.

---

# 67. Ключевые связи

```text
Tenant
 ├── Organization
 │    └── Branch
 │         ├── Employees
 │         ├── Chairs
 │         ├── Warehouses
 │         └── Cashboxes
 │
 └── Patients
      ├── Appointments
      │     └── Encounter
      │           ├── Clinical Notes
      │           ├── Diagnoses
      │           └── Procedures
      │
      ├── Odontogram
      │
      ├── Treatment Plans
      │     └── Treatment Plan Items
      │
      ├── Opportunities
      │     └── Treatment Plan
      │
      ├── Ledger
      │
      ├── Recalls
      ├── Waitlist
      ├── Documents
      └── Communications
```

---

# 68. Критический end-to-end поток

Основной сценарий должен работать как единая цепочка:

```text
Lead
 ↓
Patient
 ↓
Appointment
 ↓
Confirmation
 ↓
Check-in
 ↓
Encounter
 ↓
Odontogram / Clinical note
 ↓
Treatment plan
 ↓
Patient accepts
 ↓
Procedure
 ├── Charge
 ├── Material consumption
 └── Compensation accrual
 ↓
Payment
 ↓
Appointment completed
 ↓
Recall
 ↓
Review request
```

Именно этот поток должен быть основой integration/E2E тестирования.

---

# 69. Приоритет продуктовых преимуществ

После достижения parity с базовым MacDent/Stoma1C особенно развивать:

1. **AI Medical Scribe** — сокращение заполнения медкарты.
2. **Treatment Acceptance Analytics** — предложено/принято/реализовано.
3. **Smart Recall & Waitlist** — увеличение загрузки кресел.
4. **Chair Economics** — реальная экономика кресла.
5. **True Procedure Profitability** — доход минус врач, ассистент, материалы, лаборатория, acquiring.
6. **Digital Intake + OCR** — минимум ручного ввода.
7. **Patient/Family Portal**.
8. **Open integration platform**.
9. **Kazakhstan-native compliance/integrations**.
10. **Workflow automation** без доработки исходного кода.

---

# 70. Итоговая целевая модель

```text
                    DENTAL SaaS PLATFORM
                           │
      ┌────────────────────┼────────────────────┐
      │                    │                    │
      ▼                    ▼                    ▼
     CRM               SCHEDULING            CLINICAL
 Leads/Deals         Calendar/Recall       EMR/Odontogram
 Tasks/Workflow       Waitlist/Chairs      Treatment Plans
      │                    │                    │
      └──────────────┬─────┴─────────┬──────────┘
                     │               │
                     ▼               ▼
                  FINANCE         OPERATIONS
                  Ledger          Inventory
                  Payments        Labs
                  Payroll         Insurance
                     │               │
                     └───────┬───────┘
                             ▼
                    PATIENT EXPERIENCE
                 Portal / WhatsApp / Intake
                  Booking / Reviews / Family
                             │
                             ▼
                     INTEGRATION PLATFORM
            Government / 1C / Payment / DICOM
            Telephony / Messaging / E-sign
                             │
                             ▼
                        ANALYTICS + AI
```

**Architecture target:** одна SaaS-платформа, единая кодовая база, строгая tenant isolation, глубокая медицинская и финансовая модель, configurable workflows, Kazakhstan-first production deployment.

---

# 71. Первый следующий шаг для Codex

После принятия этого master-spec **не начинать с генерации 150 таблиц**.

Первая задача реализации:

> Создать `Phase 0 — Foundation`: monorepo, backend/frontend skeleton, PostgreSQL, Redis, object storage, tenant/organization/branch, auth context, RBAC, audit, outbox, базовый CI/CD и тест tenant isolation.

После успешного завершения Phase 0 перейти к `Phase 1 — Clinic Core`.

Для каждого следующего Phase создавать отдельное подробное ТЗ/issue, ссылаясь на этот master-spec как на архитектурный источник истины.
