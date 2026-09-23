import { z } from "zod";

const optionalUuid = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.uuid().optional(),
);

const optionalNumber = (schema: z.ZodNumber) => z.preprocess(
  (value) => value === "" ? undefined : value,
  z.coerce.number().pipe(schema).optional(),
);

export const saveServiceCategorySchema = z.object({
  categoryId: optionalUuid,
  parentId: optionalUuid,
  name: z.string().trim().min(2, "Укажите название категории.").max(160),
  sortOrder: z.coerce.number().int().min(0).max(10000),
});

export const saveServiceSchema = z.object({
  serviceId: optionalUuid,
  categoryId: z.uuid("Выберите категорию."),
  code: z.string().trim().min(1, "Укажите код услуги.").max(40),
  name: z.string().trim().min(2, "Укажите название услуги.").max(240),
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  basePrice: z.coerce.number().min(0).max(999999999999.99),
  costPrice: optionalNumber(z.number().min(0).max(999999999999.99)),
  vatRate: optionalNumber(z.number().min(0).max(100)),
});

export const setServiceActiveSchema = z.object({
  serviceId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});
