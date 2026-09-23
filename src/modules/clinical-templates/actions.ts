"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import {
  saveClinicalTemplateSchema,
  setClinicalTemplateActiveSchema,
} from "@/modules/clinical-templates/schemas";
import { requirePermission } from "@/modules/organizations/repository";

export async function saveClinicalTemplate(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("settings.manage");
  const parsed = saveClinicalTemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте содержимое клинического шаблона.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_clinical_template", {
    org_id: context.organization.id,
    target_template_id: parsed.data.templateId ?? null,
    template_name: parsed.data.name,
    template_description: parsed.data.description ?? null,
    template_chief_complaint: parsed.data.chiefComplaint ?? null,
    template_anamnesis: parsed.data.anamnesis ?? null,
    template_diagnosis_summary: parsed.data.diagnosisSummary ?? null,
    template_clinical_notes: parsed.data.clinicalNotes ?? null,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "23505"
        ? "Шаблон с таким названием уже существует."
        : "Не удалось сохранить клинический шаблон.",
    };
  }

  revalidatePath("/clinical/templates");
  return { status: "success", message: "Клинический шаблон сохранён." };
}

export async function setClinicalTemplateActive(formData: FormData) {
  const context = await requirePermission("settings.manage");
  const parsed = setClinicalTemplateActiveSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_clinical_template_active", {
    org_id: context.organization.id,
    target_template_id: parsed.templateId,
    target_is_active: parsed.isActive,
  });
  if (error) throw new Error("Не удалось изменить активность клинического шаблона.");
  revalidatePath("/clinical/templates");
}
