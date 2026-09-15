# Phase 2 — Clinical Core

Phase 2 adds the medical record workflow on top of the Phase 0 security boundary and the Phase 1 clinic calendar.

## Scope

- encounters connected to patients, doctors, branches, and optionally appointments;
- draft, signed, and amended clinical notes with append-only versions;
- encounter diagnoses and procedure status history;
- structured odontogram entries and tooth history;
- treatment plans with immutable presentation snapshots and item-level acceptance;
- document/file metadata and signatures.

All tables carry `tenant_id`, use composite tenant foreign keys, force PostgreSQL row-level security, and are written through tenant-scoped transactions. Clinical mutations also append audit and transactional outbox records.

## Record integrity

- A signed note cannot be edited with the draft update endpoint or directly in PostgreSQL.
- An amendment requires a reason and creates another signed, immutable version.
- An encounter cannot be completed until it contains a signed or amended clinical note.
- Odontogram changes append a version instead of replacing tooth history.
- Treatment-plan presentation stores an immutable price snapshot; acceptance is recorded per item.
- Document versions are immutable, and a signature points to the exact signed version.

## Main API

```text
POST /api/v1/encounters
GET  /api/v1/encounters/:id
POST /api/v1/encounters/:id/complete

POST  /api/v1/clinical-notes
PATCH /api/v1/clinical-notes/:id
POST  /api/v1/clinical-notes/:id/sign
POST  /api/v1/clinical-notes/:id/amend
GET   /api/v1/clinical-notes/:id/versions

POST /api/v1/encounters/:id/diagnoses
POST /api/v1/encounters/:id/procedures
POST /api/v1/procedures/:id/complete

GET  /api/v1/patients/:patientId/odontogram
POST /api/v1/patients/:patientId/odontogram/entries

POST /api/v1/treatment-plans
GET  /api/v1/treatment-plans/:id
POST /api/v1/treatment-plans/:id/present
POST /api/v1/treatment-plans/:id/accept

POST /api/v1/documents
GET  /api/v1/documents/:id
POST /api/v1/documents/:id/sign
```

Object bytes remain in S3-compatible storage; `document_versions` stores the immutable storage key, media type, size, and SHA-256 checksum.

## Verification

```bash
npm run db:migrate
npm run db:seed
npm run check
corepack pnpm --filter @dental/api test:integration
```
