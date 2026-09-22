import { describe, expect, it } from "vitest";

import { hasPermission } from "./catalog";

describe("hasPermission", () => {
  it("grants only explicitly assigned permissions", () => {
    const assigned = new Set(["patients.read", "appointments.read"]);

    expect(hasPermission(assigned, "patients.read")).toBe(true);
    expect(hasPermission(assigned, "finance.manage")).toBe(false);
  });
});
