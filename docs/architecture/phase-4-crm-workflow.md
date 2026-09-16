# Phase 4 — CRM and Workflow

## Goal

Deliver the operational chain `Lead -> Patient -> Opportunity -> Treatment Plan`, organization-scoped tasks, and a safe event-driven workflow engine. The administration UI remains deferred; catalogs and rules are managed through authenticated APIs until the shared admin module is built.

## Ownership and access

- Patients remain tenant-wide so one person is not duplicated between organizations in the same tenant.
- Lead sources, channels, leads, opportunity stages, opportunities, CRM activities, tasks, and workflow rules belong to one organization.
- A branch-scoped membership may read the organization catalogs required by its branch and may only access branch-owned operational rows allowed by its RBAC permissions.
- Treatment plans linked to opportunities must belong to the same organization.
- Every table carries `tenant_id`, uses forced RLS, and is accessed through the authenticated tenant transaction.

## CRM state

Lead statuses: `new`, `qualified`, `converted`, `lost`. Conversion is atomic: an existing patient is selected or a patient is created, the lead is marked converted, and an opportunity is created.

Default opportunity stages:

```text
new -> contacted -> appointment_booked -> visited -> plan_created -> plan_presented
    -> accepted -> in_treatment -> won
    -> lost
```

Every stage change creates `opportunity_stage_history` and `OpportunityStageChanged`. A stage with terminal kind `lost` requires a non-empty loss reason. A closed opportunity cannot move again.

## Tasks

Task statuses: `open`, `in_progress`, `completed`, `cancelled`. Every transition creates `task_status_history`; comments are append-only. A task may reference a lead, opportunity, patient, appointment, treatment plan, or another domain entity through an audited polymorphic reference.

## Workflow safety model

Rules subscribe to a fixed domain event name and contain structured conditions and actions. The engine never evaluates JavaScript, SQL, shell commands, or arbitrary expressions.

Supported condition operators are `equals`, `not_equals`, `exists`, and `in`. Values are read only from the event payload using dotted paths.

Phase 4 executable action:

- `CREATE_TASK` — creates an organization/branch-scoped task from validated JSON configuration.

Other architecture actions remain reserved until their owning domains expose explicit command handlers. Unknown or unavailable actions fail the workflow run and are logged; they are never silently executed.

Outbox delivery creates idempotent `workflow_runs`. Delayed rules use `scheduled_at`; a worker claims due runs with `FOR UPDATE SKIP LOCKED`. The unique `(rule_id, event_id)` constraint prevents duplicate automation.

## API surface

- `/api/v1/crm/lead-sources`, `/api/v1/crm/lead-channels`, `/api/v1/crm/opportunity-stages`
- `/api/v1/leads` with update, loss, and atomic conversion commands
- `/api/v1/opportunities` with stage transition and treatment-plan linking commands
- `/api/v1/crm/activities`
- `/api/v1/tasks` with status transitions and append-only comments
- `/api/v1/workflow/rules` and `/api/v1/workflow/runs`

## Acceptance

- A lead converts atomically to a patient and opportunity.
- An opportunity can link only to a treatment plan from the same organization.
- Every stage and task status change is auditable.
- `lost` always has a reason.
- A matching outbox event creates exactly one automatic task, including after worker retries.
- Cross-tenant and cross-organization links are rejected by RLS and composite foreign keys.

Verification:

```powershell
npm run check
corepack pnpm --filter @dental/api exec vitest run test/crm-workflow.integration.test.ts
```
