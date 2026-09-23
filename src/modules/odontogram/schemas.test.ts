import { describe, expect, it } from "vitest";

import { FDI_TOOTH_CODES } from "./constants";
import { odontogramPayloadSchema } from "./schemas";
import type { OdontogramTooth } from "./types";

function healthyPayload(): OdontogramTooth[] {
  return FDI_TOOTH_CODES.map((toothCode) => ({
    toothCode,
    state: "healthy" as const,
    notes: null,
    surfaces: [],
  }));
}

describe("odontogramPayloadSchema", () => {
  it("accepts a complete adult and child FDI chart", () => {
    expect(odontogramPayloadSchema.safeParse(healthyPayload()).success).toBe(true);
  });

  it("rejects a chart with a duplicated tooth", () => {
    const payload = healthyPayload();
    payload[51] = { ...payload[51], toothCode: "18" };

    expect(odontogramPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects duplicate surfaces for one tooth", () => {
    const payload = healthyPayload();
    payload[0] = {
      ...payload[0],
      surfaces: [
        { surface: "M", condition: "caries" },
        { surface: "M", condition: "filling" },
      ],
    };

    expect(odontogramPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
