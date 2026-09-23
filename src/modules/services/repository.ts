import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/modules/organizations/repository";
import type { ServiceCatalog } from "@/modules/services/types";

const categoryRowSchema = z.object({
  id: z.uuid(),
  parent_id: z.uuid().nullable(),
  name: z.string(),
  sort_order: z.number().int(),
  is_active: z.boolean(),
});

const serviceRowSchema = z.object({
  id: z.uuid(),
  category_id: z.uuid(),
  code: z.string(),
  name: z.string(),
  duration_minutes: z.number().int(),
  base_price: z.coerce.number(),
  cost_price: z.coerce.number().nullable(),
  is_active: z.boolean(),
  vat_rate: z.coerce.number().nullable(),
});

export async function getServiceCatalog(): Promise<ServiceCatalog> {
  const context = await getOrganizationContext();
  if (!context || (!context.can("clinical.read") && !context.can("settings.manage"))) {
    throw new AppError("FORBIDDEN", "Недостаточно прав для просмотра каталога услуг.");
  }

  const supabase = await createClient();
  const [categoriesResult, servicesResult] = await Promise.all([
    supabase.rpc("list_service_categories", { org_id: context.organization.id }),
    supabase.rpc("list_services", { org_id: context.organization.id }),
  ]);
  if (categoriesResult.error || servicesResult.error) {
    throw new AppError("SERVICES_LOAD_FAILED", "Не удалось загрузить каталог услуг.");
  }

  const categories = z.array(categoryRowSchema).safeParse(categoriesResult.data ?? []);
  const services = z.array(serviceRowSchema).safeParse(servicesResult.data ?? []);
  if (!categories.success || !services.success) {
    throw new AppError("INVALID_SERVICE_DATA", "Получены некорректные данные каталога услуг.");
  }

  return {
    categories: categories.data.map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    })),
    services: services.data.map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      code: row.code,
      name: row.name,
      durationMinutes: row.duration_minutes,
      basePrice: row.base_price,
      costPrice: row.cost_price,
      isActive: row.is_active,
      vatRate: row.vat_rate,
    })),
  };
}
