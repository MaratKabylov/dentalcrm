import { z } from "zod";

import {
  FDI_TOOTH_CODES,
  TOOTH_CONDITION_CODES,
  TOOTH_SURFACES,
} from "./constants";

const surfaceSchema = z.object({
  surface: z.enum(TOOTH_SURFACES),
  condition: z.enum(TOOTH_CONDITION_CODES),
});

export const odontogramToothSchema = z.object({
  toothCode: z.enum(FDI_TOOTH_CODES),
  state: z.enum(TOOTH_CONDITION_CODES),
  notes: z.string().trim().max(1000).nullable(),
  surfaces: z.array(surfaceSchema).max(6).superRefine((surfaces, context) => {
    if (new Set(surfaces.map((surface) => surface.surface)).size !== surfaces.length) {
      context.addIssue({ code: "custom", message: "Поверхность зуба указана несколько раз." });
    }
  }),
});

export const odontogramPayloadSchema = z.array(odontogramToothSchema).length(52).superRefine((teeth, context) => {
  const receivedCodes = new Set(teeth.map((tooth) => tooth.toothCode));
  if (receivedCodes.size !== FDI_TOOTH_CODES.length || FDI_TOOTH_CODES.some((code) => !receivedCodes.has(code))) {
    context.addIssue({ code: "custom", message: "Одонтограмма должна содержать все зубы по системе FDI." });
  }
});

export const saveOdontogramFormSchema = z.object({
  patientId: z.uuid(),
  encounterId: z.uuid(),
  payload: z.string().min(2),
});
