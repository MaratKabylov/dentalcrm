# Phase 7 — Compensation

Phase 7 adds organization-scoped, versioned compensation rules, approved time tracking, reproducible payroll calculation, adjustments, and immutable payroll approval.

## Rule versions and calculation

`compensation_rules` is the stable rule identity. Every change creates an immutable row in `compensation_rule_versions`; optional conditions select an employee, branch, service, service category, or payment method. Calculation selects the latest effective version of each matching rule for the source date.

The executable engine supports:

- percentage of charged procedure value;
- fixed amount per completed procedure quantity;
- hourly amount from approved time entries;
- salary amount once per payroll period.

Formula rules and the additional profitability bases are represented in the versioned model, but a formula rule is rejected at calculation time until a controlled formula evaluator is configured. This prevents untrusted expressions from being executed.

Each `payroll_accruals` row stores the selected rule version and a complete rule snapshot. Recalculating a non-approved period replaces its derived accruals; manual adjustments remain separate.

## Approval and immutability

A payroll period progresses from `draft` to `calculated` to `approved`. Approval stores employee totals in `payroll_approvals` and changes the period into an immutable snapshot. Database privileges and triggers prevent approved periods, accruals, and adjustments from being changed or deleted.

Only approved time sheets contribute to hourly accruals. Percentage and fixed accruals use completed procedures whose completion date falls inside the payroll period in the branch timezone.

## Salary visibility

Permissions intentionally separate salary visibility and payroll operations:

- `compensation.read_own` exposes only the authenticated employee's approved totals;
- `compensation.read_all` exposes detailed periods, rules, accruals, and adjustments;
- `compensation.calculate` manages rules, time sheets, periods, calculations, and adjustments;
- `compensation.approve` approves time sheets and payroll periods.

## HTTP surface

- `GET|POST /api/v1/compensation/rules`
- `POST /api/v1/compensation/rules/:id/versions`
- `POST /api/v1/compensation/timesheets`
- `POST /api/v1/compensation/timesheets/:id/submit|approve|reject`
- `POST /api/v1/compensation/payroll-periods`
- `GET /api/v1/compensation/payroll-periods/:id`
- `POST /api/v1/compensation/payroll-periods/:id/calculate`
- `POST /api/v1/compensation/payroll-periods/:id/adjustments`
- `POST /api/v1/compensation/payroll-periods/:id/approve`
- `GET /api/v1/compensation/my-payroll`

## Verification

`compensation.integration.test.ts` verifies percentage, fixed, and hourly calculation, rule snapshots, own-payroll visibility, and database-level immutability after approval.
