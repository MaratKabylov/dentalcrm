import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import {
  communicationChannelSchema,
  communicationDirectionSchema,
  communicationStatusSchema,
  communicationTargetTypeSchema,
  communicationTemplateCategorySchema,
} from "@/modules/communications/schemas";
import type {
  CommunicationFilters,
  CommunicationMessage,
  CommunicationSummary,
  CommunicationTarget,
  CommunicationTemplate,
} from "@/modules/communications/types";
import { requirePermission } from "@/modules/organizations/repository";

const templateRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: communicationTemplateCategorySchema,
  channel: communicationChannelSchema.nullable(),
  subject: z.string().nullable(),
  body: z.string(),
  is_active: z.boolean(),
  updated_at: z.string(),
});

const targetRowSchema = z.object({
  target_type: communicationTargetTypeSchema,
  id: z.uuid(),
  label: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
});

const messageRowSchema = z.object({
  id: z.uuid(),
  target_type: communicationTargetTypeSchema,
  target_id: z.uuid(),
  target_name: z.string(),
  channel: communicationChannelSchema,
  direction: communicationDirectionSchema,
  provider: z.string(),
  provider_message_id: z.string().nullable(),
  status: communicationStatusSchema,
  recipient: z.string(),
  subject: z.string().nullable(),
  body: z.string(),
  creator_name: z.string().nullable(),
  sent_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
});

const summaryRowSchema = z.object({
  queued_count: z.coerce.number().int().nonnegative(),
  sent_count: z.coerce.number().int().nonnegative(),
  failed_count: z.coerce.number().int().nonnegative(),
  received_count: z.coerce.number().int().nonnegative(),
});

export async function listCommunicationTemplates(includeInactive = false): Promise<CommunicationTemplate[]> {
  const context = await requirePermission("communications.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_communication_templates", {
    org_id: context.organization.id,
    include_inactive: includeInactive,
  });
  if (error) throw new AppError("COMMUNICATION_TEMPLATES_LOAD_FAILED", "Не удалось загрузить шаблоны сообщений.");
  const parsed = z.array(templateRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_COMMUNICATION_TEMPLATE_DATA", "Получены некорректные шаблоны сообщений.");
  return parsed.data.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }));
}

export async function listCommunicationTargets(): Promise<CommunicationTarget[]> {
  const context = await requirePermission("communications.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_communication_targets", {
    org_id: context.organization.id,
  });
  if (error) throw new AppError("COMMUNICATION_TARGETS_LOAD_FAILED", "Не удалось загрузить получателей.");
  const parsed = z.array(targetRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_COMMUNICATION_TARGET_DATA", "Получены некорректные данные получателей.");
  return parsed.data.map((row) => ({
    type: row.target_type,
    id: row.id,
    label: row.label,
    phone: row.phone,
    email: row.email,
  }));
}

export async function listCommunicationMessages(
  filters: CommunicationFilters = {},
): Promise<CommunicationMessage[]> {
  const context = await requirePermission("communications.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_communication_messages", {
    org_id: context.organization.id,
    search_query: filters.q || null,
    channel_filter: filters.channel && filters.channel !== "all" ? filters.channel : null,
    direction_filter: filters.direction && filters.direction !== "all" ? filters.direction : null,
    status_filter: filters.status && filters.status !== "all" ? filters.status : null,
    result_limit: 300,
  });
  if (error) throw new AppError("COMMUNICATIONS_LOAD_FAILED", "Не удалось загрузить коммуникации.");
  const parsed = z.array(messageRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_COMMUNICATION_DATA", "Получены некорректные данные коммуникаций.");
  return parsed.data.map((row) => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    channel: row.channel,
    direction: row.direction,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    status: row.status,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    creatorName: row.creator_name,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }));
}

export async function getCommunicationSummary(): Promise<CommunicationSummary> {
  const context = await requirePermission("communications.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_communication_summary", {
    org_id: context.organization.id,
  });
  if (error) throw new AppError("COMMUNICATION_SUMMARY_LOAD_FAILED", "Не удалось загрузить сводку коммуникаций.");
  const parsed = z.array(summaryRowSchema).safeParse(data ?? []);
  if (!parsed.success || !parsed.data[0]) {
    throw new AppError("INVALID_COMMUNICATION_SUMMARY_DATA", "Получена некорректная сводка коммуникаций.");
  }
  return {
    queued: parsed.data[0].queued_count,
    sent: parsed.data[0].sent_count,
    failed: parsed.data[0].failed_count,
    received: parsed.data[0].received_count,
  };
}
