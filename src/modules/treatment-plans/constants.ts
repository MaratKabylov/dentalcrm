import type { TreatmentPlanStatus } from "@/modules/treatment-plans/types";

export const TREATMENT_PLAN_STATUS_LABELS: Record<TreatmentPlanStatus, string> = {
  draft: "Черновик",
  proposed: "Предложен",
  approved: "Утверждён",
  rejected: "Отклонён",
  in_progress: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
};
