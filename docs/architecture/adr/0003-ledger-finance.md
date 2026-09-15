# ADR 0003: Ledger-based finance

## Status

Accepted.

## Decision

Finance uses an append-only, balanced ledger. Amounts are integer minor units and every ledger transaction contains at least two entries whose signed amounts sum to zero. Positive amounts are debits and negative amounts are credits.

Patient debt is the sum of entries posted to that patient's `patient_receivable` account. A patient deposit is represented by a credit balance on a `patient_deposit` liability account. Neither value is stored as a mutable field on `patients`.

Charges, payments, payment parts, allocations, deposits, refunds, expenses, cash movements, ledger transactions, and entries are immutable after posting. Corrections use new reversing transactions. PostgreSQL deferred constraint triggers verify balanced entries and immutable-row triggers reject direct edits and deletes.

Payment and refund commands require a tenant-scoped idempotency key. Mixed payments retain each tender as a separate `payment_part`; allocations state which charges were settled. Unallocated externally funded money creates a traceable patient deposit.

## Consequences

- balances and debt can always be rebuilt from ledger entries;
- partial and mixed payments remain explainable;
- refunds restore receivables or deposit liabilities and reverse the original tender accounts;
- financial reports must aggregate ledger data or rebuildable projections;
- cash movements require an open cash session.
