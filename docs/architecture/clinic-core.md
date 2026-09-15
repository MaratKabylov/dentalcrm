# Phase 1 — Clinic Core

Phase 1 is the first operational clinic slice described in the master architecture. It adds the resources needed to run a dental calendar: rooms, chairs, employees and doctor profiles, services and versioned price lists, patients, shifts, and appointments.

## Scope and invariants

- Every domain row carries `tenant_id`; PostgreSQL RLS is enabled and forced for the application role.
- `Employee` is the person employed by the clinic. `Doctor` is a role-specific profile linked one-to-one to an employee.
- A service has a stable tenant-unique code. Prices are integer minor units stored in dated price lists, never on the service row.
- Patient phone numbers are normalized for duplicate detection. A matching active phone returns `POSSIBLE_PATIENT_DUPLICATE` instead of silently creating a duplicate.
- Appointment time intervals are half-open (`[starts_at, ends_at)`). PostgreSQL exclusion constraints prevent overlaps for a doctor, chair, or room under concurrent writes.
- Cancelled, no-show, and replaced appointments no longer reserve resources.
- Appointment state changes use command endpoints and an explicit state machine. Terminal states cannot be reopened.
- Create, update, transition, and reschedule commands write business data, audit history, status history, and outbox events in the same transaction.

## API surface

All routes use `/api/v1`, the Phase 0 authentication context, and granular RBAC permissions.

```text
GET|POST  /rooms
GET|POST  /chairs
GET|POST  /employees
GET|POST  /services
GET|POST  /price-lists

GET|POST  /patients
GET|PATCH /patients/:id

GET|POST  /appointments
GET|POST  /appointments/schedule/shifts
POST      /appointments/:id/confirm
POST      /appointments/:id/check-in
POST      /appointments/:id/start
POST      /appointments/:id/complete
POST      /appointments/:id/no-show
POST      /appointments/:id/cancel
POST      /appointments/:id/reschedule
```

## State machine

```text
created ──> awaiting_confirmation ──> confirmed ──> checked_in ──> in_progress ──> completed
   │                 │                    │             │              │
   └─────────────────┴────────────────────┴─────────────┴──────────────┴──> cancelled
                                           ├──> no_show
                                           └──> rescheduled + replacement appointment
```

## Local verification

```bash
npm run infra:up
npm run db:migrate
npm run db:seed
npm run check
corepack pnpm --filter @dental/api test:integration
```

The seed command prints the local `tenantId`. Put it in `apps/web/.env.local` as `NEXT_PUBLIC_DEMO_TENANT_ID` before starting the web application. The Clinic Core screen then provides a live weekly calendar, quick patient registration, appointment creation, and normal visit-state actions.

## Acceptance mapping

- Clinic can manage its weekly schedule: shift and appointment APIs plus the live calendar screen.
- Doctor/chair/room conflicts are prevented atomically by the database and surfaced as HTTP 409 `APPOINTMENT_CONFLICT`.
- Clinic mutations are journaled through Phase 0 audit and transactional outbox services.
