import { describe, expect, it } from "vitest";

import { applyClinicalTemplate } from "./apply-template";

const emptyFields = {
  chiefComplaint: "",
  anamnesis: "",
  diagnosisSummary: "",
  clinicalNotes: "",
};

describe("applyClinicalTemplate", () => {
  it("appends template content without replacing existing text", () => {
    const result = applyClinicalTemplate(
      { ...emptyFields, chiefComplaint: "Боль при накусывании" },
      {
        chiefComplaint: "Боль усиливается вечером.",
        anamnesis: "Аллергологический анамнез уточнён.",
        diagnosisSummary: null,
        clinicalNotes: null,
      },
    );

    expect(result).toEqual({
      success: true,
      fields: {
        chiefComplaint: "Боль при накусывании\n\nБоль усиливается вечером.",
        anamnesis: "Аллергологический анамнез уточнён.",
        diagnosisSummary: "",
        clinicalNotes: "",
      },
    });
  });

  it("rejects the whole application when one field exceeds its limit", () => {
    const result = applyClinicalTemplate(
      { ...emptyFields, chiefComplaint: "а".repeat(3999) },
      {
        chiefComplaint: "ещё текст",
        anamnesis: "Этот текст также не должен примениться.",
        diagnosisSummary: null,
        clinicalNotes: null,
      },
    );

    expect(result).toEqual({ success: false });
  });
});
