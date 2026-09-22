# Vercel + Supabase deployment

## 1. Supabase values

Copy these values from the Supabase dashboard without committing them:

- Project URL.
- Publishable key (`sb_publishable_*`), or the legacy anon key.
- Secret key (`sb_secret_*`), or the legacy service-role key.
- Direct PostgreSQL connection string for migrations.
- Transaction pooler connection string on port `6543` for Vercel runtime functions.

Append `sslmode=require` to both PostgreSQL URLs. Percent-encode reserved characters in the database password.

## 2. Initialize the empty project

Create `apps/api/.env` from its template and set at minimum:

```env
NODE_ENV=development
AUTH_MODE=supabase
DATABASE_URL=postgresql://...:6543/postgres?sslmode=require
DATABASE_ADMIN_URL=postgresql://...:5432/postgres?sslmode=require
DB_POOL_MAX=2
DB_APP_ROLE=dental_app
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_STORAGE_BUCKET=dental-private
SEED_EMAIL=owner@example.com
SEED_PASSWORD=use-a-strong-unique-password
WEB_ORIGIN=http://localhost:3000
```

Then run:

```text
corepack pnpm --filter @dental/api supabase:check
npm run db:migrate
npm run db:seed
npm run check
```

Migrations create all business tables, the forced tenant RLS role, revoke Data API access from `anon` and `authenticated`, and create the private Storage bucket. Seeding creates the initial user in Supabase Auth and links the Auth user ID to the application membership.

## 3. Create Vercel projects

Import the same Git repository three times. Enable access to files outside each Root Directory so pnpm workspace packages can be resolved.

### Web project

- Root Directory: `apps/web`
- Framework: Next.js
- Environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_APP_URL=https://YOUR_WEB_DOMAIN
NEXT_PUBLIC_API_URL=https://YOUR_API_DOMAIN/api/v1
```

The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` can be used instead of the publishable key.

### API project

- Root Directory: `apps/api`
- Framework: NestJS (auto-detected by Vercel)
- Environment variables:

```env
NODE_ENV=production
AUTH_MODE=supabase
DATABASE_URL=postgresql://TRANSACTION_POOLER:6543/postgres?sslmode=require
DB_POOL_MAX=2
DB_APP_ROLE=dental_app
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_STORAGE_BUCKET=dental-private
WEB_ORIGIN=https://YOUR_WEB_DOMAIN
OIDC_AUDIENCE=authenticated
```

Do not set `DATABASE_ADMIN_URL` on the running API. It belongs only in the migration environment.

### Worker project

- Root Directory: `apps/worker`
- Framework preset: Other
- Environment variables:

```env
DATABASE_URL=postgresql://TRANSACTION_POOLER:6543/postgres?sslmode=require
DB_POOL_MAX=2
DB_APP_ROLE=dental_app
CRON_SECRET=at-least-16-random-characters
```

`vercel.json` invokes `/api/cron` every five minutes. Vercel sends `CRON_SECRET` in the Authorization header; the handler refuses requests without it.

## 4. Supabase Auth settings

In Authentication URL Configuration set:

- Site URL: the production web domain.
- Redirect URLs: the production domain plus the required Vercel preview patterns.

Email/password login is used initially. The browser sends the short-lived Supabase access token to the NestJS API. The API verifies the user with Supabase Auth, resolves the selected clinic membership, and applies the existing tenant RLS transaction context.

## 5. Deployment order

1. Apply database migrations and seed the first owner.
2. Deploy the API and copy its production URL.
3. Set `NEXT_PUBLIC_API_URL` and deploy the web project.
4. Set the production web domain as `WEB_ORIGIN` and redeploy the API.
5. Deploy the worker and confirm the Cron Job appears in the Vercel dashboard.
6. Verify `/api/v1/health/ready`, login, `/api/v1/me`, patient creation, and a private Storage signed upload.

Never place `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, database URLs, or `CRON_SECRET` in the web project.
