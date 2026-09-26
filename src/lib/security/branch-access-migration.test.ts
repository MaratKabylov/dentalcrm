import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202609260006_enforce_branch_data_access.sql"),
  "utf8",
);

describe("branch access migration", () => {
  it.each([
    "appointments",
    "invoices",
    "cash_desks",
    "payments",
    "payment_refunds",
    "leads",
    "tasks",
    "marketing_campaigns",
    "warehouses",
  ])("guards writes to %s", (table) => {
    expect(migration).toContain(`on public.${table}\n`);
    expect(migration).toMatch(new RegExp(`${table}_[a-z_]*enforce_branch`));
  });

  it.each([
    "appointments_select",
    "invoices_select",
    "cash_desks_select",
    "payments_select",
    "leads_select",
    "tasks_select",
    "marketing_campaigns_select",
    "warehouses_select",
    "stock_batches_select",
    "stock_movements_select",
    "compensation_entries_select",
  ])("replaces %s with a branch-aware policy", (policy) => {
    const policyStart = migration.indexOf(`create policy ${policy}`);
    expect(policyStart).toBeGreaterThan(-1);
    expect(migration.slice(policyStart, policyStart + 900)).toContain("current_user_has_branch_access");
  });

  it("keeps patient and clinical reads organization-wide", () => {
    expect(migration).not.toContain("drop policy patients_select");
    expect(migration).not.toContain("drop policy clinical_encounters_select");
  });

  it("filters branch-sensitive SECURITY DEFINER queues internally", () => {
    for (const functionName of ["list_billable_encounters", "list_pending_procedure_material_usage"]) {
      const functionStart = migration.indexOf(`function public.${functionName}`);
      expect(functionStart).toBeGreaterThan(-1);
      expect(migration.slice(functionStart, functionStart + 3500)).toContain("current_user_has_branch_access");
    }
  });

  it("runs general reporting RPCs as the caller so RLS remains effective", () => {
    expect(migration).toContain("alter function %s security invoker");
    expect(migration).toContain("'get_executive_analytics'");
    expect(migration).toContain("'list_invoices'");
    expect(migration).toContain("'list_inventory_balances'");
  });
});
