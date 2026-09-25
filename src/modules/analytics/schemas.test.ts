import { describe, expect, it } from "vitest";

import { analyticsFiltersSchema, defaultAnalyticsDates, parseAnalyticsFilters } from "./schemas";

const id = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("analytics filters", () => {
  it("uses a rolling thirty-day period", () => {
    expect(defaultAnalyticsDates(new Date("2026-09-25T12:00:00Z"))).toEqual({ from: "2026-08-27", to: "2026-09-25" });
  });

  it("normalizes optional dimensions", () => {
    expect(analyticsFiltersSchema.parse({ from: "2026-09-01", to: "2026-09-25", branch: "", doctor: id })).toEqual({ from: "2026-09-01", to: "2026-09-25", doctor: id });
  });

  it("falls back from an invalid period", () => {
    expect(parseAnalyticsFilters({ from: "bad", to: "2026-09-25" }, new Date("2026-09-25T12:00:00Z"))).toMatchObject({ from: "2026-08-27", to: "2026-09-25" });
  });
});
