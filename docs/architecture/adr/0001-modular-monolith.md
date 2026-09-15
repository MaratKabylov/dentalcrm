# ADR 0001: Modular monolith

- Status: accepted
- Date: 2026-09-15

## Decision

Use one TypeScript monorepo with independently runnable web, API, and worker applications. Backend domain modules live in the NestJS API and interact through explicit services and transactional domain events.

## Consequences

Transactions and tests remain simple during the early product stages. Module ownership is kept explicit so a high-load boundary can be extracted later without changing the domain model first.
