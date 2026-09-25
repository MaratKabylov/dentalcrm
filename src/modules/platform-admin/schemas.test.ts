import { describe, expect, it } from "vitest";

import { updateOrganizationAccessSchema } from "./schemas";

const organizationId = "00000000-0000-4000-8000-000000000001";

describe("updateOrganizationAccessSchema", () => {
  it("accepts active access with an end date", () => {
    expect(updateOrganizationAccessSchema.safeParse({
      organizationId,
      accessUntil: "2027-12-31",
      mode: "active",
      reason: "",
    }).success).toBe(true);
  });

  it("requires a reason for manual read-only mode", () => {
    const parsed = updateOrganizationAccessSchema.safeParse({
      organizationId,
      accessUntil: "2027-12-31",
      mode: "read_only",
      reason: "",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.reason).toBeDefined();
    }
  });
});
