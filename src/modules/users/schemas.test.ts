import { describe, expect, it } from "vitest";

import {
  createInvitationSchema,
  invitationTokenSchema,
  updateMemberStatusSchema,
} from "./schemas";

describe("user management schemas", () => {
  it("normalizes an invitation email", () => {
    const result = createInvitationSchema.parse({
      email: "  Doctor@Clinic.KZ ",
      roleId: "8bde41a4-630d-4a49-93fc-e2a9aa304f1b",
    });
    expect(result.email).toBe("doctor@clinic.kz");
  });

  it("rejects malformed invitation tokens", () => {
    expect(invitationTokenSchema.safeParse("short token").success).toBe(false);
  });

  it("only accepts supported member states", () => {
    const base = { membershipId: "8bde41a4-630d-4a49-93fc-e2a9aa304f1b" };
    expect(updateMemberStatusSchema.safeParse({ ...base, status: "suspended" }).success).toBe(true);
    expect(updateMemberStatusSchema.safeParse({ ...base, status: "deleted" }).success).toBe(false);
  });
});
