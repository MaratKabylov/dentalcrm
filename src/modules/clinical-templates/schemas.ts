import { z } from "zod";

const optionalUuid = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.uuid().optional(),
);

const optionalText = (maximum: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(maximum, `Не более ${maximum} символов.`).optional(),
);

export const saveClinicalTemplateSchema = z.object({
  templateId: optionalUuid,
  name: z.string().trim().min(2, "Укажите название шаблона.").max(160),
  description: optionalText(500),
  chiefComplaint: optionalText(4000),
  anamnesis: optionalText(8000),
  diagnosisSummary: optionalText(4000),
  clinicalNotes: optionalText(12000),
}).superRefine((value, context) => {
  if (!value.chiefComplaint && !value.anamnesis && !value.diagnosisSummary && !value.clinicalNotes) {
    context.addIssue({
      code: "custom",
      path: ["clinicalNotes"],
      message: "Заполните хотя бы одно клиническое поле.",
    });
  }
});

export const setClinicalTemplateActiveSchema = z.object({
  templateId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});
