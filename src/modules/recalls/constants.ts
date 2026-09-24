import type { RecallStatus, RecallType } from "@/modules/recalls/types";

export const recallTypeOptions: Array<{ value: RecallType; label: string }> = [
  { value: "hygiene", label: "Профессиональная гигиена" },
  { value: "control_visit", label: "Контрольный визит" },
  { value: "orthodontics", label: "Ортодонтический контроль" },
  { value: "implant_check", label: "Контроль импланта" },
  { value: "unfinished_treatment", label: "Незавершённое лечение" },
  { value: "other", label: "Другое" },
];

export const recallTypeLabels = Object.fromEntries(
  recallTypeOptions.map(({ value, label }) => [value, label]),
) as Record<RecallType, string>;

export const recallStatusOptions: Array<{ value: RecallStatus; label: string }> = [
  { value: "scheduled", label: "Запланирован" },
  { value: "due", label: "Пора связаться" },
  { value: "contacted", label: "Связались" },
  { value: "booked", label: "Записан" },
  { value: "completed", label: "Завершён" },
  { value: "cancelled", label: "Отменён" },
];

export const recallStatusLabels = Object.fromEntries(
  recallStatusOptions.map(({ value, label }) => [value, label]),
) as Record<RecallStatus, string>;
