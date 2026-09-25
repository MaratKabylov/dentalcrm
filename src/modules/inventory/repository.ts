import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/organizations/repository";
import { STOCK_MOVEMENT_TYPES, type InventoryBalance, type InventoryReferenceData, type InventoryServiceOption, type PendingProcedureMaterialUsage, type ServiceMaterialNorm, type StockBatch, type StockMovement } from "./types";

const referenceRowSchema = z.object({
  entity_type: z.enum(["category", "warehouse", "item"]),
  id: z.uuid(), parent_id: z.uuid().nullable(), code: z.string().nullable(), name: z.string(),
  unit: z.string().nullable(), min_stock: z.coerce.number().nullable(), is_active: z.boolean(), branch_name: z.string().nullable(),
});
const branchRowSchema = z.object({ id: z.uuid(), name: z.string() });
const balanceRowSchema = z.object({
  warehouse_id: z.uuid(), warehouse_name: z.string(), branch_name: z.string(), item_id: z.uuid(), sku: z.string(), item_name: z.string(),
  category_name: z.string(), unit: z.string(), min_stock: z.coerce.number(), quantity: z.coerce.number(), stock_value: z.coerce.number(), next_expiration_date: z.string().nullable(),
});
const batchRowSchema = z.object({
  id: z.uuid(), warehouse_id: z.uuid(), warehouse_name: z.string(), item_id: z.uuid(), sku: z.string(), item_name: z.string(), unit: z.string(),
  lot_number: z.string().nullable(), expiration_date: z.string().nullable(), unit_cost: z.coerce.number(), available_quantity: z.coerce.number(), received_at: z.string(),
});
const movementRowSchema = z.object({
  id: z.uuid(), movement_type: z.enum(STOCK_MOVEMENT_TYPES), warehouse_name: z.string(), item_name: z.string(), sku: z.string(), unit: z.string(),
  lot_number: z.string().nullable(), quantity: z.coerce.number(), unit_cost: z.coerce.number().nullable(), note: z.string().nullable(), created_by_name: z.string(), created_at: z.string(),
});
const normRowSchema = z.object({
  id: z.uuid(), service_id: z.uuid(), service_code: z.string(), service_name: z.string(), item_id: z.uuid(), item_sku: z.string(), item_name: z.string(), unit: z.string(), quantity: z.coerce.number(), is_active: z.boolean(),
});
const serviceOptionRowSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), is_active: z.boolean() });
const pendingUsageRowSchema = z.object({
  performed_service_id: z.uuid(), performed_at: z.string(), patient_name: z.string(), service_name: z.string(), norm_id: z.uuid(), item_id: z.uuid(),
  item_name: z.string(), item_sku: z.string(), unit: z.string(), suggested_quantity: z.coerce.number(), remaining_quantity: z.coerce.number(),
});

export async function getInventoryReferenceData(): Promise<InventoryReferenceData> {
  const context = await requirePermission("inventory.read");
  const supabase = await createClient();
  const [referenceResult, branchResult] = await Promise.all([
    supabase.rpc("list_inventory_reference_data", { org_id: context.organization.id }),
    supabase.rpc("list_inventory_branches", { org_id: context.organization.id }),
  ]);
  if (referenceResult.error || branchResult.error) throw new AppError("INVENTORY_REFERENCE_LOAD_FAILED", "Не удалось загрузить справочники склада.");
  const references = z.array(referenceRowSchema).safeParse(referenceResult.data ?? []);
  const branches = z.array(branchRowSchema).safeParse(branchResult.data ?? []);
  if (!references.success || !branches.success) throw new AppError("INVALID_INVENTORY_REFERENCE_DATA", "Получены некорректные справочники склада.");
  return {
    categories: references.data.filter((row) => row.entity_type === "category").map((row) => ({ id: row.id, name: row.name, isActive: row.is_active })),
    branches: branches.data,
    warehouses: references.data.filter((row) => row.entity_type === "warehouse" && row.parent_id && row.branch_name).map((row) => ({ id: row.id, branchId: row.parent_id!, branchName: row.branch_name!, name: row.name, isActive: row.is_active })),
    items: references.data.filter((row) => row.entity_type === "item" && row.parent_id && row.code && row.unit && row.min_stock !== null).map((row) => ({ id: row.id, categoryId: row.parent_id!, sku: row.code!, name: row.name, unit: row.unit!, minStock: row.min_stock!, isActive: row.is_active })),
  };
}

export async function listInventoryBalances(): Promise<InventoryBalance[]> {
  const context = await requirePermission("inventory.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_inventory_balances", { org_id: context.organization.id });
  if (error) throw new AppError("INVENTORY_BALANCES_LOAD_FAILED", "Не удалось загрузить остатки склада.");
  const parsed = z.array(balanceRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_INVENTORY_BALANCE_DATA", "Получены некорректные остатки склада.");
  return parsed.data.map((row) => ({ warehouseId: row.warehouse_id, warehouseName: row.warehouse_name, branchName: row.branch_name, itemId: row.item_id, sku: row.sku, itemName: row.item_name, categoryName: row.category_name, unit: row.unit, minStock: row.min_stock, quantity: row.quantity, stockValue: row.stock_value, nextExpirationDate: row.next_expiration_date }));
}

export async function listStockBatches(includeEmpty = false): Promise<StockBatch[]> {
  const context = await requirePermission("inventory.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_stock_batches", { org_id: context.organization.id, include_empty: includeEmpty });
  if (error) throw new AppError("STOCK_BATCHES_LOAD_FAILED", "Не удалось загрузить партии материалов.");
  const parsed = z.array(batchRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_STOCK_BATCH_DATA", "Получены некорректные данные партий.");
  return parsed.data.map((row) => ({ id: row.id, warehouseId: row.warehouse_id, warehouseName: row.warehouse_name, itemId: row.item_id, sku: row.sku, itemName: row.item_name, unit: row.unit, lotNumber: row.lot_number, expirationDate: row.expiration_date, unitCost: row.unit_cost, availableQuantity: row.available_quantity, receivedAt: row.received_at }));
}

export async function listStockMovements(limit = 200): Promise<StockMovement[]> {
  const context = await requirePermission("inventory.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_stock_movements", { org_id: context.organization.id, result_limit: limit });
  if (error) throw new AppError("STOCK_MOVEMENTS_LOAD_FAILED", "Не удалось загрузить движения материалов.");
  const parsed = z.array(movementRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_STOCK_MOVEMENT_DATA", "Получены некорректные движения материалов.");
  return parsed.data.map((row) => ({ id: row.id, movementType: row.movement_type, warehouseName: row.warehouse_name, itemName: row.item_name, sku: row.sku, unit: row.unit, lotNumber: row.lot_number, quantity: row.quantity, unitCost: row.unit_cost, note: row.note, createdByName: row.created_by_name, createdAt: row.created_at }));
}

export async function listServiceMaterialNorms(): Promise<ServiceMaterialNorm[]> {
  const context = await requirePermission("inventory.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_service_material_norms", { org_id: context.organization.id });
  if (error) throw new AppError("MATERIAL_NORMS_LOAD_FAILED", "Не удалось загрузить нормы материалов.");
  const parsed = z.array(normRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_MATERIAL_NORM_DATA", "Получены некорректные нормы материалов.");
  return parsed.data.map((row) => ({ id: row.id, serviceId: row.service_id, serviceCode: row.service_code, serviceName: row.service_name, itemId: row.item_id, itemSku: row.item_sku, itemName: row.item_name, unit: row.unit, quantity: row.quantity, isActive: row.is_active }));
}

export async function listInventoryServiceOptions(): Promise<InventoryServiceOption[]> {
  const context = await requirePermission("inventory.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_inventory_service_options", { org_id: context.organization.id });
  if (error) throw new AppError("INVENTORY_SERVICES_LOAD_FAILED", "Не удалось загрузить услуги для норм материалов.");
  const parsed = z.array(serviceOptionRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_INVENTORY_SERVICE_DATA", "Получены некорректные услуги.");
  return parsed.data.map((row) => ({ id: row.id, code: row.code, name: row.name, isActive: row.is_active }));
}

export async function listPendingProcedureMaterialUsage(): Promise<PendingProcedureMaterialUsage[]> {
  const context = await requirePermission("inventory.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_pending_procedure_material_usage", { org_id: context.organization.id });
  if (error) throw new AppError("PENDING_MATERIAL_USAGE_LOAD_FAILED", "Не удалось загрузить предложенные списания.");
  const parsed = z.array(pendingUsageRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_PENDING_MATERIAL_USAGE", "Получены некорректные предложенные списания.");
  return parsed.data.map((row) => ({ performedServiceId: row.performed_service_id, performedAt: row.performed_at, patientName: row.patient_name, serviceName: row.service_name, normId: row.norm_id, itemId: row.item_id, itemName: row.item_name, itemSku: row.item_sku, unit: row.unit, suggestedQuantity: row.suggested_quantity, remainingQuantity: row.remaining_quantity }));
}
