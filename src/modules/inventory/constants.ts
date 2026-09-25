import type { StockMovementType } from "./types";

export const stockMovementTypeLabels: Record<StockMovementType, string> = {
  receipt: "Поступление",
  issue: "Выдача",
  transfer_in: "Перемещение: приход",
  transfer_out: "Перемещение: расход",
  write_off: "Списание",
  correction: "Корректировка",
  procedure_usage: "Расход на процедуру",
};
