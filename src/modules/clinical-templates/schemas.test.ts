import { describe, expect, it } from "vitest";

import { saveClinicalTemplateSchema, setClinicalTemplateActiveSchema } from "./schemas";

const templateId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("saveClinicalTemplateSchema", () => {
  it("accepts a template with one clinical field", () => {
    const result = saveClinicalTemplateSchema.safeParse({
      templateId: "",
      name: "Первичный осмотр",
      description: "Общий терапевтический приём",
      chiefComplaint: "",
      anamnesis: "Аллергологический анамнез уточнён.",
      diagnosisSummary: "",
      clinicalNotes: "",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty template", () => {
    const result = saveClinicalTemplateSchema.safeParse({
      templateId,
      name: "Пустой шаблон",
      description: "Только описание",
      chiefComplaint: "",
      anamnesis: "",
      diagnosisSummary: "",
      clinicalNotes: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("setClinicalTemplateActiveSchema", () => {
  it("converts the form boolean", () => {
    const result = setClinicalTemplateActiveSchema.parse({ templateId, isActive: "false" });
    expect(result.isActive).toBe(false);
  });
});
