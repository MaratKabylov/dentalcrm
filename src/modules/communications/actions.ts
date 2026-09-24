"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import {
  queueCommunicationSchema,
  saveCommunicationTemplateSchema,
  setCommunicationTemplateActiveSchema,
} from "@/modules/communications/schemas";
import { requirePermission } from "@/modules/organizations/repository";

export async function saveCommunicationTemplate(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("communications.manage");
  const parsed = saveCommunicationTemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте параметры шаблона.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_communication_template", {
    org_id: context.organization.id,
    target_template_id: parsed.data.templateId ?? null,
    template_name: parsed.data.name,
    template_category: parsed.data.category,
    template_channel: parsed.data.channel ?? null,
    template_subject: parsed.data.subject ?? null,
    template_body: parsed.data.body,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "23505" ? "Шаблон с таким названием уже существует." : "Не удалось сохранить шаблон.",
    };
  }
  revalidatePath("/crm/communications/templates");
  revalidatePath("/crm/communications/new");
  return { status: "success", message: "Шаблон сохранён." };
}

export async function setCommunicationTemplateActive(formData: FormData) {
  const context = await requirePermission("communications.manage");
  const parsed = setCommunicationTemplateActiveSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_communication_template_active", {
    org_id: context.organization.id,
    target_template_id: parsed.templateId,
    target_is_active: parsed.isActive,
  });
  if (error) throw new Error("Не удалось изменить активность шаблона.");
  revalidatePath("/crm/communications/templates");
  revalidatePath("/crm/communications/new");
}

export async function queueCommunication(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("communications.manage");
  const parsed = queueCommunicationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте сообщение и получателя.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("queue_communication_message", {
    org_id: context.organization.id,
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    message_channel: parsed.data.channel,
    message_recipient: parsed.data.recipient,
    message_subject: parsed.data.subject ?? null,
    message_body: parsed.data.body,
    source_template_id: parsed.data.templateId ?? null,
  });
  if (error) return { status: "error", message: "Не удалось поставить сообщение в очередь." };

  revalidatePath("/crm/communications");
  redirect("/crm/communications?queued=1");
}
