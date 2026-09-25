import { Card } from "@/components/ui/card";
import { AnalyticsFilterForm } from "@/modules/analytics/analytics-filter-form";
import { AnalyticsNav } from "@/modules/analytics/analytics-nav";
import { percentage } from "@/modules/analytics/format";
import { getSourceAnalytics, listAnalyticsFilters } from "@/modules/analytics/repository";
import { parseAnalyticsFilters } from "@/modules/analytics/schemas";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function SourceAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = parseAnalyticsFilters(await searchParams); const filters = { from: parsed.from, to: parsed.to, branchId: parsed.branch, sourceId: parsed.source };
  const [rows, options, context] = await Promise.all([getSourceAnalytics(filters), listAnalyticsFilters(), getOrganizationContext()]); if (!context) return null;
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 0 });
  return <div className="mx-auto max-w-7xl space-y-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-semibold text-[var(--brand)]">Маркетинговая аналитика</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Эффективность источников</h1></div><AnalyticsNav /></div><AnalyticsFilterForm filters={filters} options={options} includeSource />
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[var(--surface-muted)] text-xs text-[var(--muted)]"><tr>{["Источник", "Лиды", "Конверсия", "Записи", "Завершено", "Выручка", "Оплаты", "Выручка / лид"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.sourceId}><td className="px-4 py-4 font-semibold"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ backgroundColor: row.sourceColor }} />{row.sourceName}</td><td className="px-4 py-4">{row.leadsCount}</td><td className="px-4 py-4">{percentage(row.convertedCount, row.leadsCount)}%</td><td className="px-4 py-4">{row.appointmentsCount}</td><td className="px-4 py-4">{row.completedAppointmentsCount}</td><td className="px-4 py-4 font-semibold">{money.format(row.revenueAmount)}</td><td className="px-4 py-4">{money.format(row.paymentsAmount)}</td><td className="px-4 py-4">{money.format(row.leadsCount ? row.revenueAmount / row.leadsCount : 0)}</td></tr>)}</tbody></table></div></Card>
  </div>;
}
