import { Card } from "@/components/ui/card";
import { AnalyticsFilterForm } from "@/modules/analytics/analytics-filter-form";
import { AnalyticsNav } from "@/modules/analytics/analytics-nav";
import { percentage } from "@/modules/analytics/format";
import { getReceptionPerformance, listAnalyticsFilters } from "@/modules/analytics/repository";
import { parseAnalyticsFilters } from "@/modules/analytics/schemas";

export default async function ReceptionAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = parseAnalyticsFilters(await searchParams); const filters = { from: parsed.from, to: parsed.to, branchId: parsed.branch };
  const [rows, options] = await Promise.all([getReceptionPerformance(filters), listAnalyticsFilters()]);
  return <div className="mx-auto max-w-7xl space-y-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-semibold text-[var(--brand)]">Аналитика команды</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Работа регистратуры</h1></div><AnalyticsNav /></div><AnalyticsFilterForm filters={filters} options={options} />
    <div className="grid gap-4 lg:grid-cols-2">{rows.map((row) => <Card key={row.employeeId} className="p-5"><h2 className="font-semibold">{row.employeeName}</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="text-2xl font-semibold">{row.leadsCount}</p><p className="text-xs text-[var(--muted)]">лидов</p></div><div><p className="text-2xl font-semibold">{percentage(row.convertedLeadsCount, row.leadsCount)}%</p><p className="text-xs text-[var(--muted)]">конверсия лидов</p></div><div><p className="text-2xl font-semibold">{row.appointmentsCreated}</p><p className="text-xs text-[var(--muted)]">записей</p></div><div><p className="text-2xl font-semibold">{percentage(row.completedAppointments, row.appointmentsCreated)}%</p><p className="text-xs text-[var(--muted)]">дошли</p></div></div><p className="mt-4 border-t pt-3 text-xs text-[var(--muted)]">Неявки: {row.noShowAppointments} · {percentage(row.noShowAppointments, row.appointmentsCreated)}% созданных записей</p></Card>)}</div>{rows.length === 0 && <Card className="p-8 text-center text-sm text-[var(--muted)]">Сотрудники регистратуры или данные периода не найдены.</Card>}
  </div>;
}
