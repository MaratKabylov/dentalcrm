# Tenant and organization scope

The SaaS hierarchy is `Tenant -> Organization -> Branch`. These levels have different jobs:

- `tenant_id` is the hard SaaS boundary. Every business query runs inside a tenant transaction and PostgreSQL RLS prevents cross-tenant access.
- `organization_id` owns reusable business catalogs: service categories, services, price lists, diagnoses, expense categories, and treatment plans.
- `branch_id` owns operational resources and activity: rooms, chairs, cashboxes, schedules, appointments, encounters, payments, and expenses.

Catalog codes are unique inside an organization, not across the whole tenant. Two organizations may therefore both use a code such as `consultation`. Composite foreign keys prevent a price list, service category, or treatment plan from referencing a catalog row owned by another organization.

Membership access is represented by `access_scopes`:

- `tenant` grants access to every organization and branch in the tenant;
- `organization` grants access to one organization and its branches;
- `branch` grants access to one branch and to the organization catalogs needed by that branch.

The authenticated context derives these scopes from the active membership. Client-provided tenant or scope claims are never used as authorization. Existing seeded owners receive a tenant-wide scope; scoped resources return no data and reject mutations when no matching scope exists.

The future administration module is only a management surface over these domain rules. The database constraints, RLS, API authorization, audit events, and outbox events remain authoritative, so building the UI later does not require changing the domain model.
