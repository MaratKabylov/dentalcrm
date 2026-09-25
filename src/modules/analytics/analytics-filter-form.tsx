import { Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AnalyticsFilterOptions, AnalyticsFilters } from "./types";

export function AnalyticsFilterForm({ filters, options, includeDoctor = false, includeSpecialization = false, includeSource = false }: { filters: AnalyticsFilters; options: AnalyticsFilterOptions; includeDoctor?: boolean; includeSpecialization?: boolean; includeSource?: boolean }) {
  return (
    <form className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto]">
      <label className="space-y-1.5"><span className="text-xs font-medium text-[var(--muted)]">С даты</span><input name="from" type="date" defaultValue={filters.from} className="h-10 w-full rounded-xl border bg-white px-3 text-sm" required /></label>
      <label className="space-y-1.5"><span className="text-xs font-medium text-[var(--muted)]">По дату</span><input name="to" type="date" defaultValue={filters.to} className="h-10 w-full rounded-xl border bg-white px-3 text-sm" required /></label>
      <label className="space-y-1.5"><span className="text-xs font-medium text-[var(--muted)]">Филиал</span><select name="branch" defaultValue={filters.branchId ?? ""} className="h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Все филиалы</option>{options.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {includeDoctor && <label className="space-y-1.5"><span className="text-xs font-medium text-[var(--muted)]">Врач</span><select name="doctor" defaultValue={filters.doctorId ?? ""} className="h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Все врачи</option>{options.doctors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {includeSpecialization && <label className="space-y-1.5"><span className="text-xs font-medium text-[var(--muted)]">Специализация</span><select name="specialization" defaultValue={filters.specializationId ?? ""} className="h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Все специализации</option>{options.specializations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {includeSource && <label className="space-y-1.5"><span className="text-xs font-medium text-[var(--muted)]">Источник</span><select name="source" defaultValue={filters.sourceId ?? ""} className="h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Все источники</option>{options.sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <Button className="self-end"><Filter className="size-4" />Применить</Button>
    </form>
  );
}
