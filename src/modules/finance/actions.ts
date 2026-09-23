"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createInvoiceFromEncounterSchema } from "@/modules/finance/schemas";
import { requirePermission } from "@/modules/organizations/repository";

export async function createInvoiceFromEncounter(formData: FormData) {
  const context = await requirePermission("finance.manage");
  const parsed = createInvoiceFromEncounterSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice_from_encounter", {
    org_id: context.organization.id,
    target_encounter_id: parsed.encounterId,
  });
  if (error) throw new Error("Не удалось выставить счёт по врачебному приёму.");
  const invoiceId = z.uuid().parse(data);

  revalidatePath("/finance");
  revalidatePath(`/clinical/encounters/${parsed.encounterId}`);
  redirect(`/finance/invoices/${invoiceId}`);
}
