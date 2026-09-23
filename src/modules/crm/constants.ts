import type { LeadActivityType, LeadStatus } from "@/modules/crm/types";

export const leadStatusOptions: Array<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "Новый" },
  { value: "contacted", label: "Связались" },
  { value: "appointment_booked", label: "Записан" },
  { value: "thinking", label: "Размышляет" },
  { value: "lost", label: "Потерян" },
  { value: "converted", label: "Стал пациентом" },
];

export const editableLeadStatusOptions = leadStatusOptions.filter(
  ({ value }) => value !== "converted",
);

export const leadStatusLabels = Object.fromEntries(
  leadStatusOptions.map(({ value, label }) => [value, label]),
) as Record<LeadStatus, string>;

export const leadActivityOptions: Array<{ value: LeadActivityType; label: string }> = [
  { value: "note", label: "Заметка" },
  { value: "call", label: "Звонок" },
  { value: "email", label: "Email" },
  { value: "message", label: "Сообщение" },
];

export const leadActivityLabels: Record<LeadActivityType | "status_change", string> = {
  note: "Заметка",
  call: "Звонок",
  email: "Email",
  message: "Сообщение",
  status_change: "Смена статуса",
};
