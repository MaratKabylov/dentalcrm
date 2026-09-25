import { describe, expect, it } from "vitest";

import { renderDocumentTemplate } from "./template-renderer";
import { saveDocumentTemplateSchema, signDocumentSchema } from "./schemas";

const id = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("document schemas and rendering", () => {
  it("renders known variables and reports unknown placeholders", () => {
    const result = renderDocumentTemplate(
      "Пациент: {{ patient_full_name }}. {{unknown_value}}",
      { patient_full_name: "Айгуль Серикова" },
    );
    expect(result.rendered).toContain("Айгуль Серикова");
    expect(result.unresolved).toEqual(["unknown_value"]);
  });

  it("normalizes an optional consent type", () => {
    const parsed = saveDocumentTemplateSchema.parse({
      templateId: "",
      name: " Рекомендации ",
      documentType: "recommendations",
      consentType: "",
      titleTemplate: "Рекомендации пациенту",
      bodyTemplate: "Подробный текст рекомендаций пациенту.",
    });
    expect(parsed.name).toBe("Рекомендации");
    expect(parsed.consentType).toBeUndefined();
  });

  it("requires explicit confirmation before signing", () => {
    expect(signDocumentSchema.safeParse({ documentId: id, signerName: "Пациент" }).success).toBe(false);
    expect(signDocumentSchema.safeParse({ documentId: id, signerName: "Пациент", confirmation: "on" }).success).toBe(true);
  });
});
