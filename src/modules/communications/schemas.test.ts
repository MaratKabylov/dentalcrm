import { describe, expect, it } from "vitest";

import { queueCommunicationSchema, saveCommunicationTemplateSchema } from "./schemas";
import { findCommunicationPlaceholders, renderCommunicationTemplate } from "./template-renderer";

const targetId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("communication schemas and templates", () => {
  it("normalizes optional template fields", () => {
    const parsed = saveCommunicationTemplateSchema.parse({
      name: "  Напоминание  ",
      category: "appointment",
      channel: "",
      subject: "",
      body: "  Здравствуйте, {{recipient_name}}  ",
    });
    expect(parsed.name).toBe("Напоминание");
    expect(parsed.channel).toBeUndefined();
    expect(parsed.subject).toBeUndefined();
  });

  it("renders known variables and reports unresolved placeholders", () => {
    const rendered = renderCommunicationTemplate(
      "Здравствуйте, {{recipient_name}}. Приём {{appointment_date}}.",
      { recipient_name: "Айгуль" },
    );
    expect(rendered.body).toContain("Айгуль");
    expect(rendered.unresolved).toEqual(["appointment_date"]);
    expect(findCommunicationPlaceholders(rendered.body)).toEqual(["appointment_date"]);
  });

  it("rejects unresolved variables and invalid email recipients", () => {
    expect(queueCommunicationSchema.safeParse({
      targetType: "patient",
      targetId,
      channel: "email",
      recipient: "invalid",
      body: "Здравствуйте, {{recipient_name}}",
    }).success).toBe(false);
  });
});
