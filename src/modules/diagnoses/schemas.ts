import { z } from "zod";

import { FDI_TOOTH_CODES } from "../odontogram/constants";

const optionalString = (schema: z.ZodString) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  schema.optional(),
);

export const addEncounterDiagnosisSchema = z.object({
  encounterId: z.uuid(),
  diagnosisId: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.uuid().optional(),
  ),
  code: optionalString(z.string().trim().max(32)),
  name: optionalString(z.string().trim().max(300)),
  system: z.enum(["local", "icd10"]),
  toothCode: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.enum(FDI_TOOTH_CODES).optional(),
  ),
  type: z.enum(["primary", "secondary", "differential"]),
  notes: optionalString(z.string().trim().max(2000)),
}).superRefine((value, context) => {
  if (!value.diagnosisId && (!value.code || value.code.length < 1)) {
    context.addIssue({ code: "custom", path: ["code"], message: "Укажите код диагноза." });
  }
  if (!value.diagnosisId && (!value.name || value.name.length < 2)) {
    context.addIssue({ code: "custom", path: ["name"], message: "Укажите название диагноза." });
  }
});

export const removeEncounterDiagnosisSchema = z.object({
  encounterDiagnosisId: z.uuid(),
  encounterId: z.uuid(),
});
