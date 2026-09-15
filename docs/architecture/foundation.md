# Phase 0 — Foundation

This increment implements the first vertical Foundation slice from the master architecture.

## Runtime boundaries

- `apps/web`: Next.js staff web shell.
- `apps/api`: NestJS REST API. It owns authentication context, authorization, tenant transaction setup, audit, and domain writes.
- `apps/worker`: transactional outbox consumer. It processes each active tenant independently and records idempotent handler delivery.
- `packages/contracts`: transport validation and shared DTO contracts.
- `infrastructure/docker`: PostgreSQL, Redis, and S3-compatible MinIO for local development.

## Tenant boundary

The client cannot send a `tenantId` in organization commands. A signed OIDC token supplies `tenant_id` and `sub`; the API resolves that pair to an active membership. Local development headers exist only in `AUTH_MODE=development`, and configuration validation rejects that mode in production.

Every tenant operation uses a database transaction that:

1. assumes the non-superuser `dental_app` database role;
2. sets transaction-local `app.tenant_id`, `app.user_id`, and `app.request_id` values;
3. executes repositories under forced PostgreSQL RLS;
4. commits or rolls back as one unit.

Composite foreign keys prevent a branch, role, or assignment from referencing an entity in another tenant.

## First vertical use case

`POST /api/v1/organizations` requires `settings.manage`. Its transaction inserts:

- the organization;
- a tamper-evident audit record;
- an `OrganizationCreated` outbox event.

The worker claims events with `FOR UPDATE SKIP LOCKED`. Its delivery table has a unique `(tenant_id, event_id, handler)` key, so a handler is idempotent.

## Authentication

Production mode validates JWT signature, issuer, audience, expiry, subject, and `tenant_id` through the configured OIDC JWKS endpoint. The issuer and JWKS URLs are separate settings so Keycloak, Supabase Auth, or another compatible provider can be used without provider-specific code. MFA remains an identity-provider policy; the application is ready to consume the resulting signed tokens but does not implement passwords.

## Verification

```bash
npm run infra:up
npm run db:migrate
npm run db:seed
npm run check
corepack pnpm --filter @dental/api test:integration
```

The integration test changes the PostgreSQL tenant context inside one transaction and proves that another tenant's row is invisible and cannot be forged on insert.
