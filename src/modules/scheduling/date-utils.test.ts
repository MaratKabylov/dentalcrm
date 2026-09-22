import { describe, expect, it } from "vitest";

import {
  getCalendarRange,
  normalizeCalendarDate,
  shiftCalendarDate,
} from "./date-utils";

describe("calendar date utilities", () => {
  it("builds a Monday-to-Sunday range", () => {
    expect(getCalendarRange("2026-09-22", "week")).toEqual({
      from: "2026-09-21",
      to: "2026-09-27",
    });
  });

  it("shifts day and week views without local timezone drift", () => {
    expect(shiftCalendarDate("2026-09-22", "day", 1)).toBe("2026-09-23");
    expect(shiftCalendarDate("2026-09-22", "week", -1)).toBe("2026-09-15");
  });

  it("falls back for invalid query dates", () => {
    expect(normalizeCalendarDate("2026-02-31", new Date("2026-09-22T00:00:00Z")))
      .toBe("2026-09-22");
  });
});
