# Dental OS

Multi-tenant operating system for dental clinics in Kazakhstan. **Phases 0 and 1** from [`DENTAL_OS_MASTER_ARCHITECTURE.md`](./DENTAL_OS_MASTER_ARCHITECTURE.md) are complete. Phase 2 is in progress: clinical encounters, the versioned FDI odontogram and structured encounter diagnoses are implemented, with the treatment catalogue next.

## Stack

- Next.js 16 App Router, React 19 and strict TypeScript
- Supabase Auth and PostgreSQL with tenant isolation through RLS
- Tailwind CSS 4 and local shadcn-style UI primitives
- Zod for all server action input validation
- Vitest for domain unit tests

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and provide the Supabase project URL and anon key.
3. Start local Supabase (Docker and Supabase CLI are required): `npx supabase start`
4. Apply all migrations and seed data: `npx supabase db reset`
5. Start the app: `npm run dev`

Create the first Auth user in Supabase Studio. After login, `/onboarding` atomically creates the organization, its first branch, an active membership and the owner role.

## Security model

- Browser code receives only the public Supabase URL and anon key.
- Tenant identity comes from active `organization_members`, never from untrusted form data.
- Every tenant table created in Phase 0 has RLS enabled.
- Permission checks are backed by `current_user_has_permission`, a narrowly scoped `security definer` function.
- Organization bootstrapping runs in one database function and writes an audit record.
- System roles cannot be edited through authenticated-client policies; custom roles are organization-scoped.
- Patient records are tenant-scoped, protected by permission-aware RLS and written through audited database functions.
- Appointment conflicts are blocked in PostgreSQL; every status transition is recorded and patient arrival emits a targeted realtime notification.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Production environments must use their own Supabase project and apply committed migrations rather than manual schema edits.
