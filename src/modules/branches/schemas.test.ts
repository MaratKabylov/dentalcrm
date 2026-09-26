import { describe, expect, it } from "vitest";

import {
  branchWorkingHoursSchema,
  saveBranchSchema,
  setMemberBranchScopeSchema,
} from "./schemas";

describe("saveBranchSchema", () => {
  it("normalizes optional contact fields", () => {
    const parsed = saveBranchSchema.parse({
      name: "Центр",
      address: "",
      phone: "",
      email: "",
      timezone: "Asia/Qyzylorda",
    });

    expect(parsed.address).toBeNull();
    expect(parsed.email).toBeNull();
  });
});

describe("branchWorkingHoursSchema", () => {
  it("rejects an inverted working interval", () => {
    const schedule = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      isWorking: index === 0,
      startTime: index === 0 ? "18:00" : null,
      endTime: index === 0 ? "09:00" : null,
    }));

    expect(branchWorkingHoursSchema.safeParse(schedule).success).toBe(false);
  });
});

describe("setMemberBranchScopeSchema", () => {
  it("converts the explicit access mode to a boolean", () => {
    const parsed = setMemberBranchScopeSchema.parse({
      branchId: "11111111-1111-4111-8111-111111111111",
      membershipId: "22222222-2222-4222-8222-222222222222",
      allowAllBranches: "false",
    });

    expect(parsed.allowAllBranches).toBe(false);
  });
});
