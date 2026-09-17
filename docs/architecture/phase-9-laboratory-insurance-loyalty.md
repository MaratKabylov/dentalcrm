# Phase 9 — Laboratory, Insurance, and Loyalty

Phase 9 adds laboratory case tracking, insurance contracting and claim settlement, and append-only loyalty and promotion workflows.

## Laboratory

Laboratory cases are organization-scoped and tied to a patient, responsible doctor, and one or more procedure or treatment-plan items. Each item snapshots its laboratory cost and currency for downstream profitability reporting.

The database and service layer enforce the case state machine:

`ordered → impression_taken/sent → in_production → received → fitted/completed`

`rework` is explicit and requires a reason. Status history, files, and invoices remain separate records; status events and invoices are immutable. `LabCaseCreated` and `LabCaseReceived` are emitted through the transactional outbox. `LaboratoryProvider` is the vendor-neutral integration boundary.

## Insurance

The insurance catalog contains companies, plans, effective-dated price lists, and patient policies. A claim may include only completed procedures belonging to the insured patient and organization. The billed amount cannot exceed the effective contracted price multiplied by policy coverage.

Claims progress from `draft` to `submitted`, then to `approved`, `partially_approved`, or `rejected`. Every item must be adjudicated exactly once, and its approved amount cannot exceed its billed amount. Payments are idempotent, cannot exceed the approved claim amount, and mark a claim paid only when the approved total is settled.

Each insurance payment also posts a balanced Phase 3 ledger transaction: insurance clearing is debited and the patient's receivable is credited. Payment and claim histories are immutable.

## Loyalty and promotions

Loyalty rules are immutable and effective-dated. Bonus balances are never stored as a mutable field; they are calculated from append-only `bonus_transactions`. Account-level locking and a database trigger prevent concurrent redemption from producing a negative balance. Earn, redeem, and manual adjustment operations are idempotent.

Promotions support percentage or fixed discounts, effective periods, service restrictions, global usage limits, and patient-bound coupons. Quote and redemption are separate operations. A promotion redemption produces a discount snapshot for the caller to use before posting the final immutable charge; it never rewrites a posted finance record.

## HTTP surface

Laboratory:

- `POST /api/v1/laboratory/laboratories`
- `GET|POST /api/v1/laboratory/cases`
- `GET /api/v1/laboratory/cases/:id`
- `POST /api/v1/laboratory/cases/:id/transition`
- `POST /api/v1/laboratory/cases/:id/files|invoices`

Insurance:

- `POST /api/v1/insurance/companies|plans|price-lists|policies`
- `GET|POST /api/v1/insurance/claims`
- `GET /api/v1/insurance/claims/:id`
- `POST /api/v1/insurance/claims/:id/submit|adjudicate|payments`

Loyalty and promotions:

- `POST /api/v1/loyalty/programs`
- `POST /api/v1/loyalty/programs/:id/award|adjust|redeem`
- `GET /api/v1/loyalty/programs/:id/patients/:patientId/balance`
- `POST /api/v1/loyalty/promotions|coupons`
- `POST /api/v1/loyalty/promotions/quote|redeem`

## Verification

`commercial-phase9.integration.test.ts` verifies the laboratory state machine and immutable invoices, contracted insurance limits and balanced settlement, nonnegative append-only bonus balances, and coupon exhaustion.

