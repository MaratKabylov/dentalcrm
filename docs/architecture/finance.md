# Phase 3 — Finance

Phase 3 adds the append-only financial core: charges, mixed payments, deposits, debt, refunds, cashboxes, sessions, and expenses.

## Invariants

- Money is accepted only as integer minor units (for example, `100000` is KZT 1,000.00 if the currency uses two decimals).
- Every ledger transaction is balanced: signed entries sum to zero and contain at least two rows.
- Patient balance is derived from the `patient_receivable` ledger account; positive means debt and negative means credit.
- Posted financial rows cannot be updated or deleted. A refund posts new reverse entries.
- Cash payments, cash refunds, and cash expenses require an open cash session.
- Payments and refunds require an `Idempotency-Key` header.
- Tenant-scoped foreign keys, forced row-level security, audit records, and outbox events apply to all financial operations.

## Posting examples

```text
Charge 100,000:       receivable +100,000 / revenue -100,000
Payment 70,000:       cash +70,000 / receivable -70,000
Refund 20,000:        receivable +20,000 / cash -20,000
Advance 30,000:       cash +30,000 / deposit liability -30,000
Use deposit 10,000:   deposit liability +10,000 / receivable -10,000
Cash expense 5,000:   expense +5,000 / cash -5,000
```

## Main API

```text
POST /api/v1/charges
POST /api/v1/payments
GET  /api/v1/payments/:id
POST /api/v1/payments/:id/refund

GET  /api/v1/patients/:patientId/ledger
GET  /api/v1/patients/:patientId/balance
GET  /api/v1/patients/:patientId/deposits

POST /api/v1/cashboxes
POST /api/v1/cashboxes/:id/sessions/open
POST /api/v1/cash-sessions/:id/close
POST /api/v1/expense-categories
POST /api/v1/expenses
```

To take an advance, post a payment with an empty `allocations` array; its externally funded remainder becomes a deposit. A mixed payment may combine cash, card, bank transfer, Kaspi, and one or more existing deposits. The allocated total may be lower than a charge total; the remaining receivable is the patient's debt.

## Verification

```bash
npm run db:migrate
npm run check
corepack pnpm --filter @dental/api test:integration
```
