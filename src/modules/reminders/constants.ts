import type { ReminderEventCode, ReminderJobStatus } from "@/modules/reminders/types";

export const reminderEventOptions: Array<{ value: ReminderEventCode; label: string }> = [
  { value: "appointment_booked", label: "Сразу после записи" },
  { value: "appointment_before_24h", label: "За 24 часа до приёма" },
  { value: "appointment_before_2h", label: "За 2 часа до приёма" },
  { value: "appointment_no_show", label: "После неявки" },
  { value: "appointment_completed", label: "После завершённого приёма" },
  { value: "recall_due", label: "В дату повторного визита" },
];

export const reminderEventLabels = Object.fromEntries(
  reminderEventOptions.map(({ value, label }) => [value, label]),
) as Record<ReminderEventCode, string>;

export const reminderJobStatusLabels: Record<ReminderJobStatus, string> = {
  pending: "Ожидает",
  queued: "В очереди сообщений",
  skipped: "Пропущено",
  failed: "Ошибка",
};
