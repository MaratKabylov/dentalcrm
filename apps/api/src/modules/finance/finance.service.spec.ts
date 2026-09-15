import { describe, expect, it } from "vitest";
import { sumMoney } from "./finance.service.js";

describe("finance money arithmetic", () => {
  it("sums integer minor units without floating-point amounts", () => {
    expect(sumMoney([40_000, 30_000, 20_000])).toBe(90_000);
    expect(sumMoney([100_000, -90_000, -10_000], true)).toBe(0);
  });

  it("rejects unsafe or fractional amounts", () => {
    expect(() => sumMoney([1.5])).toThrow("safe integer");
    expect(() => sumMoney([Number.MAX_SAFE_INTEGER, 1])).toThrow("safe integer range");
  });
});
