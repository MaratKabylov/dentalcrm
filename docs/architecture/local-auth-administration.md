# Local Authentication and Administration

The local authentication adapter exists to exercise the complete application during development before an OIDC provider is connected. It is not a production identity system. Environment validation rejects `AUTH_MODE=local` and `AUTH_MODE=development` when `NODE_ENV=production`.

## Authentication boundary

Authentication and authorization remain separate:

- `local_credentials` proves a user's identity with a normalized tenant-local username and a salted scrypt password hash.
- `user_sessions` stores only a SHA-256 hash of the opaque browser token. Sessions expire, can be revoked, and stop working immediately when the membership is suspended.
- `memberships`, roles, permissions, and access scopes remain the authoritative authorization model.
- The browser receives an HttpOnly, SameSite cookie and never stores a password or session token in JavaScript-accessible storage.

Five failed passwords lock a credential for 15 minutes. Error responses do not disclose whether the tenant, username, password, or session was invalid. Local sessions default to 12 hours and can be configured with `LOCAL_SESSION_HOURS`.

When Keycloak is introduced, `LocalAuthService` and the login UI redirect are replaced by OIDC Authorization Code + PKCE. `IdentityRepository`, permission guards, tenant RLS, roles, and administration APIs stay unchanged.

## Local workflow

```text
npm run db:migrate
npm run db:seed
npm run dev
```

Default development login:

```text
tenant: demo-clinic
username: owner
password: change-me-local
```

Override the last two values with `SEED_LOGIN` and `SEED_PASSWORD`. Re-running seed does not overwrite an existing password.

## API

- `POST /api/v1/auth/login` creates the local session cookie.
- `POST /api/v1/auth/logout` revokes the database session and clears the cookie.
- `GET /api/v1/me` returns the current user, tenant, permissions, and access scopes.
- `GET /api/v1/admin/access` returns memberships, roles, permissions, organizations, and branches.
- `POST /api/v1/admin/roles` creates a tenant-local custom role.
- `PATCH /api/v1/admin/memberships/:id/access` updates membership status, roles, and scopes atomically.

Administration requires `settings.manage`. A user cannot suspend their own membership, and the last active owner cannot be suspended or stripped of the owner role. Every role or access mutation is appended to the audit trail.

## Frontend

`AuthShell` protects the application and presents the login screen for an absent or expired session. All API requests use `credentials: include`. A 401 response returns the UI to login. `/admin` provides role creation and membership role/scope management.

## Verification

`local-auth-admin.integration.test.ts` covers invalid passwords, opaque sessions, principal resolution, RBAC administration, branch scope, and logout revocation. The HTTP smoke test additionally verifies login cookie → `/me` → `/admin/access` → logout → 401.
