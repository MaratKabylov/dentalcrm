# ADR 0002: Shared-schema multi-tenancy

- Status: accepted
- Date: 2026-09-15

## Decision

Use a shared PostgreSQL schema with mandatory `tenant_id` on business tables. Tenant identity comes from authenticated claims plus active membership lookup. Application filters are backed by forced PostgreSQL RLS under a non-superuser role.

## Consequences

Every repository operation must run inside `DatabaseService.withTenant`. Cross-tenant relationships use composite foreign keys. Integration tests must exercise RLS using the application role, even when CI connects as a PostgreSQL owner.
