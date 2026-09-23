import { z } from "zod";

const optionalClinicalText = (maximum: number) =>
  z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum, `Не более ${maximum} символов.`).optional(),
  );

export const startClinicalEncounterSchema = z.object({
  appointmentId: z.uuid(),
});

export const saveClinicalEncounterSchema = z.object({
  encounterId: z.uuid(),
  chiefComplaint: optionalClinicalText(4000),
  anamnesis: optionalClinicalText(8000),
  diagnosisSummary: optionalClinicalText(4000),
  clinicalNotes: optionalClinicalText(12000),
  intent: z.enum(["save", "close"]),
});

export const clinicalEncounterIdSchema = z.uuid();
