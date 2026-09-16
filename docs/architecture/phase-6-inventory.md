# Phase 6 — Inventory

Phase 6 adds organization-scoped products, warehouses, batch tracking, stock documents, service recipes, and procedure material consumption.

## Source of truth

`stock_movements` is the only authoritative stock ledger. A balance is always reconstructed as `SUM(quantity_delta)` by tenant, warehouse, product, and batch. Application-role permissions and a database trigger make movements append-only; corrections must be posted as new stock documents.

Every posting command runs in one tenant transaction and writes the business document, lines, movements, audit event, and outbox event atomically. Per-warehouse/product advisory locks serialize competing deductions and stocktakes.

## FEFO

Transfers, writeoffs, and confirmed procedure consumption allocate positive stock in this order:

1. earliest `expires_at`;
2. earliest `manufactured_at`;
3. stable batch identifier;
4. non-batched stock last.

The complete command rolls back with `INSUFFICIENT_STOCK` if the requested quantity cannot be allocated. Transfers preserve the source batch at the destination.

## Procedure consumption

`ProcedureCompleted` is consumed idempotently by the worker. If the procedure service has an active recipe, the worker creates one `planned` material consumption and multiplies each recipe quantity by the procedure quantity. A storekeeper can review or replace the actual quantities and confirm the plan against a warehouse. Confirmation posts a consumption document and FEFO movements atomically.

## HTTP surface

- `GET|POST /api/v1/inventory/units`
- `GET|POST /api/v1/inventory/categories`
- `GET|POST /api/v1/inventory/suppliers`
- `GET|POST /api/v1/inventory/products`
- `GET|POST /api/v1/inventory/warehouses`
- `GET /api/v1/inventory/stock`
- `GET /api/v1/inventory/alerts?days=30`
- `POST /api/v1/stock/receipts`
- `POST /api/v1/stock/transfers`
- `POST /api/v1/stock/writeoffs`
- `POST /api/v1/stocktakes`
- `GET|POST /api/v1/inventory/recipes`
- `GET /api/v1/inventory/consumptions`
- `POST /api/v1/inventory/consumptions/:id/confirm`

Permissions are split into `inventory.read`, `inventory.receive`, `inventory.transfer`, `inventory.writeoff`, and `inventory.adjust`. Organization and branch access checks are applied in addition to tenant RLS.

## Alerts

The alert projection reports batches that are expired or expire inside the requested horizon, plus warehouse/product totals below `minimum_stock`. It is rebuilt from movements and batch metadata, so it cannot drift from ledger stock.

## Verification

`inventory.integration.test.ts` verifies movement-derived balances, FEFO ordering, denial of movement mutation, recipe quantity expansion, and idempotent planning per procedure.
