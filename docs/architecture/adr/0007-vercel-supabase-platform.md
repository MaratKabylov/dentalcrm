# ADR 0007: Vercel application runtime with Supabase platform services

- Status: accepted
- Date: 2026-09-22

## Decision

Deploy the Next.js frontend, NestJS API, and bounded cron worker as separate Vercel projects. Use Supabase for PostgreSQL, Auth, and private object Storage. This supersedes the production identity-provider choice in ADR 0006; application authorization remains in tenant memberships, roles, scopes, and forced PostgreSQL RLS.

The browser authenticates with Supabase Auth and sends its access token plus the selected tenant slug to the API. The API validates the access token with Supabase, resolves an active tenant membership, and starts every business transaction under `dental_app` with `app.tenant_id` set locally.

Business tables are not exposed through the Supabase Data API. The `anon` and `authenticated` database roles receive no grants on them. Private files use server-issued, short-lived Storage upload and download URLs. Secret and service-role keys remain server-only.

The former continuously running worker is retained as a bounded, idempotent batch invoked by Vercel Cron. PostgreSQL outbox locking and delivery records continue to provide concurrency safety and idempotency.

## Consequences

Runtime database connections use the Supabase transaction pooler with a small application pool. Schema migration uses a separate direct administrative connection that is never configured on deployed API or worker functions. Next.js public configuration is frozen at build time and must be present in the Vercel web project before deployment.
