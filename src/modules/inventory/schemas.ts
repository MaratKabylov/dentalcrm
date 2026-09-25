import { z } from "zod";

const emptyToUndefined = (value: unknown) => typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalUuid = z.preprocess(emptyToUndefined, z.uuid().optional());
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const quantitySchema = z.coerce.number().positive("Количество должно быть больше нуля.").max(999999999);

export const saveInventoryCategorySchema = z.object({
  categoryId: optionalUuid,
  name: z.string().trim().min(2, "Укажите название категории.").max(160),
});

export const saveWarehouseSchema = z.object({
  warehouseId: optionalUuid,
  branchId: z.uuid("Выберите филиал."),
  name: z.string().trim().min(2, "Укажите название склада.").max(160),
});

export const setInventoryActiveSchema = z.object({
  id: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const saveInventoryItemSchema = z.object({
  itemId: optionalUuid,
  categoryId: z.uuid("Выберите категорию."),
  sku: z.string().trim().min(1, "Укажите артикул.").max(60),
  name: z.string().trim().min(2, "Укажите название материала.").max(240),
  unit: z.string().trim().min(1, "Укажите единицу измерения.").max(40),
  minStock: z.coerce.number().min(0, "Минимальный остаток не может быть отрицательным.").max(999999999),
});

export const saveMaterialNormSchema = z.object({
  normId: optionalUuid,
  serviceId: z.uuid("Выберите услугу."),
  itemId: z.uuid("Выберите материал."),
  quantity: quantitySchema,
});

export const recordReceiptSchema = z.object({
  warehouseId: z.uuid("Выберите склад."),
  itemId: z.uuid("Выберите материал."),
  quantity: quantitySchema,
  unitCost: z.coerce.number().min(0, "Себестоимость не может быть отрицательной.").max(999999999),
  lotNumber: optionalText(120),
  expirationDate: z.preprocess(emptyToUndefined, z.iso.date().optional()),
  note: optionalText(1000),
});

export const recordOutflowSchema = z.object({
  batchId: z.uuid("Выберите партию."),
  movementType: z.enum(["issue", "write_off"]),
  quantity: quantitySchema,
  note: optionalText(1000),
}).superRefine((value, context) => {
  if (value.movementType === "write_off" && (!value.note || value.note.length < 3)) {
    context.addIssue({ code: "custom", path: ["note"], message: "Для списания укажите причину." });
  }
});

export const recordCorrectionSchema = z.object({
  batchId: z.uuid("Выберите партию."),
  quantity: z.coerce.number().refine((value) => value !== 0, "Корректировка не может быть нулевой.").refine((value) => Math.abs(value) <= 999999999, "Слишком большое значение."),
  reason: z.string().trim().min(3, "Укажите причину корректировки.").max(1000),
});

export const transferStockSchema = z.object({
  batchId: z.uuid("Выберите партию."),
  destinationWarehouseId: z.uuid("Выберите склад назначения."),
  quantity: quantitySchema,
  note: optionalText(1000),
});

export const procedureUsageSchema = z.object({
  performedServiceId: z.uuid(),
  normId: z.uuid(),
  batchId: z.uuid("Выберите партию."),
  quantity: quantitySchema,
});
