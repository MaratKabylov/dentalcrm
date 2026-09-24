import type { TaskPriority, TaskStatus } from "@/modules/tasks/types";

export const taskStatusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "К выполнению" },
  { value: "in_progress", label: "В работе" },
  { value: "done", label: "Выполнена" },
  { value: "cancelled", label: "Отменена" },
];

export const taskStatusLabels = Object.fromEntries(
  taskStatusOptions.map(({ value, label }) => [value, label]),
) as Record<TaskStatus, string>;

export const taskPriorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Низкий" },
  { value: "normal", label: "Обычный" },
  { value: "high", label: "Высокий" },
  { value: "urgent", label: "Срочный" },
];

export const taskPriorityLabels = Object.fromEntries(
  taskPriorityOptions.map(({ value, label }) => [value, label]),
) as Record<TaskPriority, string>;
