import { z } from "zod";

import { FDI_TOOTH_CODES } from "../odontogram/constants";

const optionalUuid = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.uuid().optional(),
);

const optionalString = (schema: z.ZodString) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  schema.optional(),
);

export const addPerformedServiceSchema = z.object({
  encounterId: z.uuid(),
  serviceId: optionalUuid,
  treatmentPlanItemId: optionalUuid,
  toothCode: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.enum(FDI_TOOTH_CODES).optional(),
  ),
  quantity: z.coerce.number().positive("Количество должно быть больше нуля.").max(100),
  discountAmount: z.coerce.number().min(0, "Скидка не может быть отрицательной."),
  notes: optionalString(z.string().trim().max(2000)),
}).superRefine((value, context) => {
  if (!value.serviceId && !value.treatmentPlanItemId) {
    context.addIssue({
      code: "custom",
      path: ["serviceId"],
      message: "Выберите услугу или пункт плана лечения.",
    });
  }
});

export const voidPerformedServiceSchema = z.object({
  performedServiceId: z.uuid(),
  encounterId: z.uuid(),
  reason: z.string().trim().min(3, "Укажите причину аннулирования.").max(500),
});
