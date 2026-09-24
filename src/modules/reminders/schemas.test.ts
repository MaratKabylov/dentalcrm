import { describe, expect, it } from "vitest";

import { saveAutomationRuleSchema } from "./schemas";

describe("saveAutomationRuleSchema", () => {
  it("accepts a valid appointment reminder", () => {
    expect(saveAutomationRuleSchema.safeParse({
      name: "За сутки до приёма",
      eventCode: "appointment_before_24h",
      channel: "whatsapp",
      templateId: "35a3c34a-5ad2-4f10-9a61-b07f94ef7e94",
    }).success).toBe(true);
  });

  it("rejects unknown events", () => {
    expect(saveAutomationRuleSchema.safeParse({
      name: "Неверное правило",
      eventCode: "custom_delay",
      channel: "sms",
      templateId: "35a3c34a-5ad2-4f10-9a61-b07f94ef7e94",
    }).success).toBe(false);
  });
});
