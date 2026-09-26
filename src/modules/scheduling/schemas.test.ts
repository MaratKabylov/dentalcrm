import { describe, expect, it } from "vitest";

import {
  doctorBranchAssignmentSchema,
  doctorScheduleExceptionSchema,
} from "./schemas";

describe("doctorBranchAssignmentSchema", () => {
  it("normalizes checkbox and numeric values", () => {
    const parsed = doctorBranchAssignmentSchema.parse({
      doctorId: "11111111-1111-4111-8111-111111111111",
      branchId: "22222222-2222-4222-8222-222222222222",
      roomName: "Кабинет 2",
      durationMinutes: "45",
      acceptsOnlineBooking: "on",
    });

    expect(parsed.durationMinutes).toBe(45);
    expect(parsed.acceptsOnlineBooking).toBe(true);
  });
});

describe("doctorScheduleExceptionSchema", () => {
  it("requires time boundaries only for custom hours", () => {
    const base = {
      doctorId: "11111111-1111-4111-8111-111111111111",
      branchId: "22222222-2222-4222-8222-222222222222",
      date: "2026-10-01",
      reason: "",
    };

    expect(doctorScheduleExceptionSchema.safeParse({ ...base, type: "day_off", startTime: "", endTime: "" }).success).toBe(true);
    expect(doctorScheduleExceptionSchema.safeParse({ ...base, type: "custom_hours", startTime: "18:00", endTime: "09:00" }).success).toBe(false);
  });
});
