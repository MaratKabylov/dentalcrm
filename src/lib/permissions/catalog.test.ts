import { describe, expect, it } from "vitest";

import { hasPermission, isWritePermission } from "./catalog";

describe("hasPermission", () => {
  it("grants only explicitly assigned permissions", () => {
    const assigned = new Set(["patients.read", "appointments.read"]);

    expect(hasPermission(assigned, "patients.read")).toBe(true);
    expect(hasPermission(assigned, "finance.manage")).toBe(false);
  });
});

describe("isWritePermission", () => {
  it("separates read access from organization mutations", () => {
    expect(isWritePermission("patients.read")).toBe(false);
    expect(isWritePermission("patients.create")).toBe(true);
    expect(isWritePermission("settings.manage")).toBe(true);
  });
});
