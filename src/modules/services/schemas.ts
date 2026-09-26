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
  scope: z.enum(["organization", "branch"]),
  branchId: optionalUuid,
  priceValidFrom: z.iso.date(),
}).superRefine((value, context) => {
  if (value.scope === "branch" && !value.branchId) {
    context.addIssue({ code: "custom", path: ["branchId"], message: "Выберите филиал." });
  }
  if (value.scope === "organization" && value.branchId) {
    context.addIssue({ code: "custom", path: ["branchId"], message: "Для общей услуги филиал не указывается." });
  }
});

export const saveServiceBranchOverrideSchema = z.object({
  serviceId: z.uuid(),
  branchId: z.uuid("Выберите филиал."),
  isAvailable: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  durationMinutes: optionalNumber(z.number().int().min(5).max(1440)),
  price: optionalNumber(z.number().min(0).max(999999999999.99)),
  priceValidFrom: z.iso.date(),
});

export const setServiceActiveSchema = z.object({
  serviceId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
  scope: z.enum(["organization", "branch"]),
  branchId: optionalUuid,
});
