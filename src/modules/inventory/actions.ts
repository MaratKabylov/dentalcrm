"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { procedureUsageSchema, recordCorrectionSchema, recordOutflowSchema, recordReceiptSchema, saveInventoryCategorySchema, saveInventoryItemSchema, saveMaterialNormSchema, saveWarehouseSchema, setInventoryActiveSchema, transferStockSchema } from "./schemas";
import { requirePermission } from "@/modules/organizations/repository";

function refreshInventory() {
  for (const path of ["/inventory", "/inventory/items", "/inventory/warehouses", "/inventory/movements", "/inventory/norms", "/inventory/usage"]) revalidatePath(path);
}

export async function saveInventoryCategory(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = saveInventoryCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте название категории.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_inventory_category", { org_id: context.organization.id, target_category_id: parsed.data.categoryId ?? null, category_name: parsed.data.name });
  if (error) return { status: "error", message: error.code === "23505" ? "Категория с таким названием уже существует." : "Не удалось сохранить категорию." };
  refreshInventory();
  return { status: "success", message: "Категория сохранена." };
}

export async function saveWarehouse(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = saveWarehouseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте данные склада.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_warehouse", { org_id: context.organization.id, target_warehouse_id: parsed.data.warehouseId ?? null, target_branch_id: parsed.data.branchId, warehouse_name: parsed.data.name });
  if (error) return { status: "error", message: error.code === "23505" ? "Склад с таким названием уже существует в филиале." : "Не удалось сохранить склад." };
  refreshInventory();
  return { status: "success", message: "Склад сохранён." };
}

export async function setWarehouseActive(formData: FormData): Promise<void> {
  const context = await requirePermission("inventory.manage");
  const parsed = setInventoryActiveSchema.parse({ id: formData.get("warehouseId"), isActive: formData.get("isActive") });
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_warehouse_active", { org_id: context.organization.id, target_warehouse_id: parsed.id, target_is_active: parsed.isActive });
  if (error) throw new Error("Не удалось изменить активность склада.");
  refreshInventory();
}

export async function saveInventoryItem(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = saveInventoryItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте данные материала.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_inventory_item", { org_id: context.organization.id, target_item_id: parsed.data.itemId ?? null, target_category_id: parsed.data.categoryId, item_sku: parsed.data.sku, item_name: parsed.data.name, item_unit: parsed.data.unit, item_min_stock: parsed.data.minStock });
  if (error) return { status: "error", message: error.code === "23505" ? "Материал с таким артикулом уже существует." : "Не удалось сохранить материал." };
  refreshInventory();
  return { status: "success", message: "Материал сохранён." };
}

export async function setInventoryItemActive(formData: FormData): Promise<void> {
  const context = await requirePermission("inventory.manage");
  const parsed = setInventoryActiveSchema.parse({ id: formData.get("itemId"), isActive: formData.get("isActive") });
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_inventory_item_active", { org_id: context.organization.id, target_item_id: parsed.id, target_is_active: parsed.isActive });
  if (error) throw new Error("Не удалось изменить активность материала.");
  refreshInventory();
}

export async function saveMaterialNorm(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = saveMaterialNormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте норму расхода.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_service_material_norm", { org_id: context.organization.id, target_norm_id: parsed.data.normId ?? null, target_service_id: parsed.data.serviceId, target_item_id: parsed.data.itemId, norm_quantity: parsed.data.quantity });
  if (error) return { status: "error", message: error.code === "23505" ? "Для этой услуги и материала норма уже существует." : "Не удалось сохранить норму материала." };
  refreshInventory();
  return { status: "success", message: "Норма материала сохранена." };
}

export async function setMaterialNormActive(formData: FormData): Promise<void> {
  const context = await requirePermission("inventory.manage");
  const parsed = setInventoryActiveSchema.parse({ id: formData.get("normId"), isActive: formData.get("isActive") });
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_service_material_norm_active", { org_id: context.organization.id, target_norm_id: parsed.id, target_is_active: parsed.isActive });
  if (error) throw new Error("Не удалось изменить активность нормы.");
  refreshInventory();
}

export async function recordInventoryReceipt(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = recordReceiptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте данные поступления.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_inventory_receipt", { org_id: context.organization.id, target_warehouse_id: parsed.data.warehouseId, target_item_id: parsed.data.itemId, received_quantity: parsed.data.quantity, received_unit_cost: parsed.data.unitCost, received_lot_number: parsed.data.lotNumber ?? null, received_expiration_date: parsed.data.expirationDate ?? null, movement_note: parsed.data.note ?? null });
  if (error) return { status: "error", message: "Не удалось провести поступление." };
  refreshInventory();
  return { status: "success", message: "Поступление проведено и партия создана." };
}

export async function recordInventoryOutflow(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = recordOutflowSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте данные расхода.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_inventory_outflow", { org_id: context.organization.id, target_batch_id: parsed.data.batchId, outflow_type: parsed.data.movementType, outflow_quantity: parsed.data.quantity, movement_note: parsed.data.note ?? null });
  if (error) return { status: "error", message: "Не удалось провести расход. Проверьте остаток партии." };
  refreshInventory();
  return { status: "success", message: parsed.data.movementType === "write_off" ? "Списание проведено." : "Выдача проведена." };
}

export async function recordInventoryCorrection(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = recordCorrectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте корректировку.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_inventory_correction", { org_id: context.organization.id, target_batch_id: parsed.data.batchId, adjustment_quantity: parsed.data.quantity, correction_reason: parsed.data.reason });
  if (error) return { status: "error", message: "Не удалось провести корректировку. Остаток не может стать отрицательным." };
  refreshInventory();
  return { status: "success", message: "Корректировка проведена и зафиксирована в аудите." };
}

export async function transferInventoryStock(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = transferStockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте данные перемещения.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_inventory_stock", { org_id: context.organization.id, source_batch_id: parsed.data.batchId, destination_warehouse_id: parsed.data.destinationWarehouseId, transfer_quantity: parsed.data.quantity, transfer_note: parsed.data.note ?? null });
  if (error) return { status: "error", message: "Не удалось переместить материал. Проверьте склад назначения и остаток партии." };
  refreshInventory();
  return { status: "success", message: "Перемещение проведено двумя связанными движениями." };
}

export async function writeOffProcedureMaterial(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = procedureUsageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте партию и количество.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("write_off_procedure_material", { org_id: context.organization.id, target_performed_service_id: parsed.data.performedServiceId, target_norm_id: parsed.data.normId, target_batch_id: parsed.data.batchId, usage_quantity: parsed.data.quantity });
  if (error) return { status: "error", message: "Не удалось списать материал. Проверьте остаток партии и норму процедуры." };
  refreshInventory();
  return { status: "success", message: "Материал списан на выполненную процедуру." };
}
