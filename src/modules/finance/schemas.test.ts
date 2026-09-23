import { describe, expect, it } from "vitest";

import { createInvoiceFromEncounterSchema } from "./schemas";

describe("createInvoiceFromEncounterSchema", () => {
  it("accepts an encounter UUID", () => {
    expect(createInvoiceFromEncounterSchema.safeParse({
      encounterId: "6f6073d3-0ba8-4bf4-943d-f819df3d4f31",
    }).success).toBe(true);
  });

  it("rejects an arbitrary encounter reference", () => {
    expect(createInvoiceFromEncounterSchema.safeParse({ encounterId: "encounter-1" }).success).toBe(false);
  });
});
