import { Card } from "@/components/ui/card";
import { AnalyticsFilterForm } from "@/modules/analytics/analytics-filter-form";
import { AnalyticsNav } from "@/modules/analytics/analytics-nav";
import { minutesAsHours, percentage } from "@/modules/analytics/format";
import { getDoctorPerformance, listAnalyticsFilters } from "@/modules/analytics/repository";
import { parseAnalyticsFilters } from "@/modules/analytics/schemas";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function DoctorAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = parseAnalyticsFilters(await searchParams); const filters = { from: parsed.from, to: parsed.to, branchId: parsed.branch, specializationId: parsed.specialization };
  const [rows, options, context] = await Promise.all([getDoctorPerformance(filters), listAnalyticsFilters(), getOrganizationContext()]); if (!context) return null;
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 0 });
  return <div className="mx-auto max-w-7xl space-y-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-semibold text-[var(--brand)]">Аналитика команды</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Эффективность врачей</h1></div><AnalyticsNav /></div><AnalyticsFilterForm filters={filters} options={options} includeSpecialization />
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[var(--surface-muted)] text-xs text-[var(--muted)]"><tr>{["Врач", "Записи", "Завершено", "Неявки", "Загрузка", "Выработка", "Материалы", "Маржа до ФОТ"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.doctorId}><td className="px-4 py-4"><p className="font-semibold">{row.doctorName}</p><p className="mt-1 text-xs text-[var(--muted)]">{row.specializationName}</p></td><td className="px-4 py-4">{row.appointmentsCount}</td><td className="px-4 py-4">{row.completedCount} <span className="text-xs text-[var(--muted)]">({percentage(row.completedCount, row.appointmentsCount)}%)</span></td><td className="px-4 py-4">{row.noShowCount}</td><td className="px-4 py-4"><p className="font-semibold">{percentage(row.completedMinutes, row.availableMinutes)}%</p><p className="text-xs text-[var(--muted)]">{minutesAsHours(row.completedMinutes)} / {minutesAsHours(row.availableMinutes)}</p></td><td className="px-4 py-4 font-semibold">{money.format(row.productionAmount)}</td><td className="px-4 py-4">{money.format(row.materialCost)}</td><td className="px-4 py-4 font-semibold text-[var(--brand-dark)]">{money.format(row.productionAmount - row.materialCost)}</td></tr>)}</tbody></table></div>{rows.length === 0 && <p className="p-8 text-center text-sm text-[var(--muted)]">В выбранном периоде данных нет.</p>}</Card>
  </div>;
}
