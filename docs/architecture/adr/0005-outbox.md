# ADR 0005: Transactional outbox

- Status: accepted
- Date: 2026-09-15

## Decision

Persist domain events in `outbox_events` in the same database transaction as state changes. A separate worker claims events and records idempotent handler delivery before marking events processed.

## Consequences

Domain writes never depend on an unreliable publish-after-commit step. Handlers must use stable names and tolerate retries. A future queue can be added behind the dispatcher without changing domain transactions.
