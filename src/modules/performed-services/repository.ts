import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/organizations/repository";
import type {
  AvailableTreatmentPlanItem,
  PerformedService,
} from "@/modules/performed-services/types";

const performedServiceRowSchema = z.object({
  id: z.uuid(),
  service_id: z.uuid(),
  treatment_plan_item_id: z.uuid().nullable(),
  service_code: z.string(),
  service_name: z.string(),
  tooth_code: z.string().nullable(),
  quantity: z.coerce.number(),
  unit_price: z.coerce.number(),
  discount_amount: z.coerce.number(),
  final_amount: z.coerce.number(),
  notes: z.string().nullable(),
  performed_at: z.string(),
  voided_at: z.string().nullable(),
  void_reason: z.string().nullable(),
  treatment_plan_id: z.uuid().nullable(),
  treatment_plan_title: z.string().nullable(),
});

const availablePlanItemRowSchema = z.object({
  treatment_plan_item_id: z.uuid(),
  treatment_plan_id: z.uuid(),
  treatment_plan_title: z.string(),
  service_id: z.uuid(),
  service_code: z.string(),
  service_name: z.string(),
  tooth_code: z.string().nullable(),
  remaining_quantity: z.coerce.number(),
  unit_price: z.coerce.number(),
});

export async function listEncounterPerformedServices(
  encounterId: string,
): Promise<PerformedService[]> {
  const context = await requirePermission("clinical.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_encounter_performed_services", {
    org_id: context.organization.id,
    target_encounter_id: encounterId,
  });
  if (error) {
    throw new AppError(
      "PERFORMED_SERVICES_LOAD_FAILED",
      "Не удалось загрузить выполненные процедуры.",
    );
  }

  const parsed = z.array(performedServiceRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new AppError(
      "INVALID_PERFORMED_SERVICE_DATA",
      "Получены некорректные данные выполненных процедур.",
    );
  }

  return parsed.data.map((row) => ({
    id: row.id,
    serviceId: row.service_id,
    treatmentPlanItemId: row.treatment_plan_item_id,
    serviceCode: row.service_code,
    serviceName: row.service_name,
    toothCode: row.tooth_code,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    discountAmount: row.discount_amount,
    finalAmount: row.final_amount,
    notes: row.notes,
    performedAt: row.performed_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    treatmentPlanId: row.treatment_plan_id,
    treatmentPlanTitle: row.treatment_plan_title,
  }));
}

export async function listAvailablePlanItemsForEncounter(
  encounterId: string,
): Promise<AvailableTreatmentPlanItem[]> {
  const context = await requirePermission("clinical.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_available_plan_items_for_encounter", {
    org_id: context.organization.id,
    target_encounter_id: encounterId,
  });
  if (error) {
    throw new AppError(
      "AVAILABLE_PLAN_ITEMS_LOAD_FAILED",
      "Не удалось загрузить доступные пункты плана лечения.",
    );
  }

  const parsed = z.array(availablePlanItemRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new AppError(
      "INVALID_AVAILABLE_PLAN_ITEM_DATA",
      "Получены некорректные данные пунктов плана лечения.",
    );
  }

  return parsed.data.map((row) => ({
    treatmentPlanItemId: row.treatment_plan_item_id,
    treatmentPlanId: row.treatment_plan_id,
    treatmentPlanTitle: row.treatment_plan_title,
    serviceId: row.service_id,
    serviceCode: row.service_code,
    serviceName: row.service_name,
    toothCode: row.tooth_code,
    remainingQuantity: row.remaining_quantity,
    unitPrice: row.unit_price,
  }));
}
