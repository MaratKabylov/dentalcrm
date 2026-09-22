# Dental SaaS

Dental clinic platform deployed on Vercel with Supabase PostgreSQL, Auth, and Storage.

## Architecture

- `apps/web`: Next.js frontend on Vercel.
- `apps/api`: NestJS API on Vercel Functions.
- `apps/worker`: bounded background processing invoked by Vercel Cron.
- Supabase: PostgreSQL, user authentication, and the private `dental-private` storage bucket.

Business data is accessed only through the NestJS API. PostgreSQL RLS, application permissions, audit events, and transactional domain rules remain authoritative. Supabase's public Data API roles have no direct access to the business tables.

## First-time Supabase setup

1. Copy `apps/api/.env.template` to `apps/api/.env` and `apps/web/.env.template` to `apps/web/.env.local`.
2. Fill the Supabase project URL, publishable/secret keys, direct database URL, and transaction-pooler URL.
3. Install dependencies with `npm run setup`.
4. Verify API credentials with `corepack pnpm --filter @dental/api supabase:check`.
5. Apply the empty schema with `npm run db:migrate`.
6. Set a strong `SEED_PASSWORD`, then run `npm run db:seed`. This creates the first Supabase Auth user and its clinic owner membership.
7. Start locally with `npm run dev`.

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1
- OpenAPI: http://localhost:4000/docs

The default initial login is tenant `demo-clinic` and email `owner@example.com`. Its password is the `SEED_PASSWORD` value used during seeding.

See [Vercel + Supabase deployment](docs/deployment/vercel-supabase.md) for production configuration and [Foundation](docs/architecture/foundation.md) for domain architecture.
