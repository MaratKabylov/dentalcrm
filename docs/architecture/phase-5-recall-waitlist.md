# Phase 5 — Recall and Waitlist

## Goal

Turn completed care into rule-driven follow-up and released future appointments into safe, targeted waitlist offers. Recall and waitlist data is organization-scoped; patients remain tenant-wide.

## Recall

`recall_types` defines an interval in days and may be limited to one service. When the outbox worker handles `AppointmentCompleted`, it creates one recall per matching active rule. The unique source appointment/rule key makes retries idempotent. Scheduled recalls become due when read on or after `due_on`.

Recall statuses are `scheduled`, `due`, `contacted`, `booked`, `completed`, and `cancelled`. Outreach is append-only in `recall_attempts`; a booked attempt must point to an appointment for the same patient and organization.

## Waitlist matching

A waitlist entry includes a date range, required duration, minimum notice, priority, and optional doctor, specialty, branch, ISO weekday, and local-time preferences. Preferences of one kind are alternatives; different kinds are combined.

When the worker handles `AppointmentCancelled`, it loads the released future slot in the branch timezone, excludes the cancelled patient, and selects compatible active entries. Up to 50 candidates receive idempotent offers ordered by priority and creation time. Each `WaitlistSlotAvailable` event carries the one-time self-booking token for the notification adapter. Tokens are stored only as SHA-256 hashes and are redacted from worker logs.

## Atomic self-booking

Public offer endpoints derive the tenant from the opaque token, then enter the normal tenant/RLS transaction. Acceptance locks the offer, verifies its expiry and the cancelled source slot, creates a replacement appointment, copies its services, and supersedes competing offers in one transaction.

PostgreSQL appointment exclusion constraints and the unique accepted-offer index ensure that concurrent confirmations cannot occupy the same doctor, chair, or room slot twice.

## API surface

- `GET|POST /api/v1/recall/types`
- `GET /api/v1/recalls`
- `POST /api/v1/recalls/:id/attempts`
- `GET|POST /api/v1/waitlist/entries`
- `POST /api/v1/waitlist/entries/:id/cancel`
- `GET /api/v1/waitlist/offers`
- `GET /api/v1/public/waitlist/offers/:token`
- `POST /api/v1/public/waitlist/offers/:token/accept`
- `POST /api/v1/public/waitlist/offers/:token/decline`

## Permissions

- `recalls.read`, `recalls.manage`
- `waitlist.read`, `waitlist.manage`

## Acceptance

- A completed appointment creates each applicable recall once, including after an outbox retry.
- A released future slot creates offers only for entries compatible with its branch, doctor or specialty, local date/time, duration, and minimum notice.
- Only one concurrent offer acceptance can reserve the released slot.
- Public links reveal no patient data and expired, declined, accepted, or superseded tokens cannot be reused.
- All operational tables use forced tenant RLS and organization-aware foreign keys.

Verification:

```powershell
npm run check
corepack pnpm --filter @dental/api exec vitest run test/recall-waitlist.integration.test.ts
```
