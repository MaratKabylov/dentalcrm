# Dental SaaS

Implementation of the architecture in `DENTAL_SAAS_MASTER_ARCHITECTURE.md`.

## Local development

1. Copy `.env.template` to `.env` and `apps/api/.env`.
2. Run `npm run setup`.
3. Start dependencies with `npm run infra:up`.
4. Apply the schema with `npm run db:migrate` and create demo access with `npm run db:seed`.
5. Start all apps with `npm run dev`.

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1
- OpenAPI: http://localhost:4000/docs
- MinIO console: http://localhost:9001

Local development defaults to `AUTH_MODE=local`. After `npm run db:seed`, sign in with tenant `demo-clinic`, username `owner`, and password `change-me-local` (override with `SEED_LOGIN` and `SEED_PASSWORD`). Passwords are scrypt-hashed and the browser receives only a revocable HttpOnly session cookie. Both `local` and header-based `development` modes are rejected when `NODE_ENV=production`; production uses signed OIDC access tokens and JWKS discovery.

See [Foundation](docs/architecture/foundation.md), [Tenant and organization scope](docs/architecture/organization-scope.md),
[Clinic Core](docs/architecture/clinic-core.md), [Clinical Core](docs/architecture/clinical-core.md), [Finance](docs/architecture/finance.md),
[CRM and Workflow](docs/architecture/phase-4-crm-workflow.md), [Recall and Waitlist](docs/architecture/phase-5-recall-waitlist.md),
[Inventory](docs/architecture/phase-6-inventory.md), [Compensation](docs/architecture/phase-7-compensation.md), and
[Patient Experience](docs/architecture/phase-8-patient-experience.md),
[Laboratory, Insurance, and Loyalty](docs/architecture/phase-9-laboratory-insurance-loyalty.md), and
[Advanced Analytics](docs/architecture/phase-11-advanced-analytics.md) for domain boundaries. See
[Local Authentication and Administration](docs/architecture/local-auth-administration.md) for the development login, session security, and admin panel.
