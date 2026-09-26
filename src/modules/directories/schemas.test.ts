import { describe, expect, it } from "vitest";

import { saveDirectoryEntrySchema, setDirectoryEntryActiveSchema } from "./schemas";

describe("saveDirectoryEntrySchema", () => {
  it("accepts a global directory value", () => {
    const parsed = saveDirectoryEntrySchema.safeParse({
      entryId: "", kind: "employee_position", code: "assistant", name: "Ассистент",
      color: "", scope: "organization", branchId: "", sortOrder: "100",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires a branch for local values", () => {
    const parsed = saveDirectoryEntrySchema.safeParse({
      entryId: "", kind: "room", code: "room_1", name: "Кабинет 1",
      color: "", scope: "branch", branchId: "", sortOrder: "100",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("setDirectoryEntryActiveSchema", () => {
  it("accepts an organization value without a branch", () => {
    const parsed = setDirectoryEntryActiveSchema.safeParse({
      entryId: "9f519c97-b276-4bde-b660-a8292f16021c",
      kind: "specialization",
      scope: "organization",
      branchId: "",
      isActive: "false",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires the branch that owns a local value", () => {
    const parsed = setDirectoryEntryActiveSchema.safeParse({
      entryId: "9f519c97-b276-4bde-b660-a8292f16021c",
      kind: "room",
      scope: "branch",
      branchId: "",
      isActive: "false",
    });
    expect(parsed.success).toBe(false);
  });
});
