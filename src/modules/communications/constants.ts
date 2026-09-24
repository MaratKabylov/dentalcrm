import type {
  CommunicationChannel,
  CommunicationStatus,
  CommunicationTemplateCategory,
} from "@/modules/communications/types";

export const communicationChannelOptions: Array<{ value: CommunicationChannel; label: string }> = [
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "email", label: "Email" },
  { value: "push", label: "Push" },
];

export const communicationChannelLabels = Object.fromEntries(
  communicationChannelOptions.map(({ value, label }) => [value, label]),
) as Record<CommunicationChannel, string>;

export const communicationStatusLabels: Record<CommunicationStatus, string> = {
  queued: "В очереди",
  sending: "Отправляется",
  sent: "Отправлено",
  delivered: "Доставлено",
  failed: "Ошибка",
  received: "Получено",
  cancelled: "Отменено",
};

export const communicationTemplateCategoryOptions: Array<{
  value: CommunicationTemplateCategory;
  label: string;
}> = [
  { value: "general", label: "Общий" },
  { value: "appointment", label: "Запись на приём" },
  { value: "recall", label: "Повторный визит" },
  { value: "marketing", label: "Маркетинг" },
];

export const communicationTemplateCategoryLabels = Object.fromEntries(
  communicationTemplateCategoryOptions.map(({ value, label }) => [value, label]),
) as Record<CommunicationTemplateCategory, string>;
