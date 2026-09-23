import { z } from "zod";

import { FDI_TOOTH_CODES } from "../odontogram/constants";

const optionalUuid = z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional());

export const treatmentPlanItemSchema = z.object({
  serviceId: z.uuid(),
  toothCode: z.enum(FDI_TOOTH_CODES).nullable(),
  quantity: z.number().positive().max(100),
  unitPrice: z.number().min(0).max(999999999999.99),
  discountAmount: z.number().min(0).max(999999999999.99),
  priority: z.number().int().min(1).max(5),
  plannedOrder: z.number().int().min(1).max(1000),
  notes: z.string().trim().max(2000).nullable(),
}).refine((item) => item.discountAmount <= item.quantity * item.unitPrice, {
  path: ["discountAmount"],
  message: "Скидка не может превышать стоимость позиции.",
});

export const treatmentPlanItemsSchema = z.array(treatmentPlanItemSchema).min(1).max(100).superRefine((items, context) => {
  if (new Set(items.map((item) => item.plannedOrder)).size !== items.length) {
    context.addIssue({ code: "custom", message: "Порядок позиций не должен повторяться." });
  }
});

export const saveTreatmentPlanFormSchema = z.object({
  planId: optionalUuid,
  patientId: z.uuid(),
  doctorId: z.uuid("Выберите врача."),
  title: z.string().trim().min(2, "Укажите название плана.").max(240),
  items: z.string().min(2),
});

export const changeTreatmentPlanStatusSchema = z.object({
  planId: z.uuid(),
  patientId: z.uuid(),
  status: z.enum(["proposed", "approved", "rejected", "in_progress", "completed", "cancelled"]),
});

export const treatmentPlanIdSchema = z.uuid();
