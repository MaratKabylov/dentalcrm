import Link from "next/link";
import { Banknote, CalendarCheck2, CircleDollarSign, ClipboardList, Coins, ReceiptText, UsersRound } from "lucide-react";

import { Card } from "@/components/ui/card";
import { AnalyticsFilterForm } from "@/modules/analytics/analytics-filter-form";
import { AnalyticsNav } from "@/modules/analytics/analytics-nav";
import { percentage } from "@/modules/analytics/format";
import { getDailyAnalyticsSeries, getExecutiveAnalytics, listAnalyticsFilters } from "@/modules/analytics/repository";
import { parseAnalyticsFilters } from "@/modules/analytics/schemas";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const parsed = parseAnalyticsFilters(query);
  const filters = { from: parsed.from, to: parsed.to, branchId: parsed.branch, doctorId: parsed.doctor };
  const [summary, series, options, context] = await Promise.all([getExecutiveAnalytics(filters), getDailyAnalyticsSeries(filters), listAnalyticsFilters(), getOrganizationContext()]);
  if (!context) return null;
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 0 });
  const maxDaily = Math.max(1, ...series.map((row) => Math.max(row.revenueAmount, row.paymentsAmount)));
  const cards = [
    { label: "Выручка", value: money.format(summary.revenueAmount), detail: `Средний чек ${money.format(summary.averageBill)}`, icon: CircleDollarSign },
    { label: "Оплаты", value: money.format(summary.paymentsAmount), detail: `Долг ${money.format(summary.debtAmount)}`, icon: Banknote },
    { label: "Выполнено визитов", value: summary.completedCount.toLocaleString("ru-RU"), detail: `${percentage(summary.completedCount, summary.appointmentsCount)}% от записей`, icon: CalendarCheck2 },
    { label: "Новые пациенты", value: summary.newPatientsCount.toLocaleString("ru-RU"), detail: `Повторных ${summary.returningPatientsCount}`, icon: UsersRound },
    { label: "Планы лечения", value: summary.treatmentPlansCount.toLocaleString("ru-RU"), detail: `Принято ${percentage(summary.acceptedPlansCount, summary.treatmentPlansCount)}%`, icon: ClipboardList },
    { label: "Выработка врачей", value: money.format(summary.doctorProduction), detail: `Материалы ${money.format(summary.materialCost)}`, icon: Coins },
  ];
  return <div className="mx-auto max-w-7xl space-y-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-semibold text-[var(--brand)]">Фаза 7</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Управленческая аналитика</h1><p className="mt-2 text-sm text-[var(--muted)]">Финансы, загрузка, пациенты и эффективность лечения в одном периоде.</p></div><AnalyticsNav /></div><AnalyticsFilterForm filters={filters} options={options} includeDoctor />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(({ label, value, detail, icon: Icon }) => <Card key={label} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-[var(--muted)]">{detail}</p></div><div className="grid size-10 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Icon className="size-5" /></div></div></Card>)}</div>
    <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]"><Card className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Динамика по дням</h2><p className="mt-1 text-xs text-[var(--muted)]">Выручка и фактические оплаты</p></div><div className="flex gap-3 text-[10px] text-[var(--muted)]"><span><i className="mr-1 inline-block size-2 rounded-full bg-[var(--brand)]" />выручка</span><span><i className="mr-1 inline-block size-2 rounded-full bg-sky-500" />оплаты</span></div></div><div className="mt-6 flex h-48 items-end gap-1 overflow-hidden">{series.map((row) => <div key={row.date} title={`${row.date}: ${money.format(row.revenueAmount)} / ${money.format(row.paymentsAmount)}`} className="flex h-full min-w-1 flex-1 items-end gap-px"><div className="w-1/2 rounded-t bg-[var(--brand)]" style={{ height: `${Math.max(row.revenueAmount > 0 ? 3 : 0, row.revenueAmount / maxDaily * 100)}%` }} /><div className="w-1/2 rounded-t bg-sky-500" style={{ height: `${Math.max(row.paymentsAmount > 0 ? 3 : 0, row.paymentsAmount / maxDaily * 100)}%` }} /></div>)}</div></Card>
      <Card className="p-5"><h2 className="font-semibold">Качество потока</h2><div className="mt-5 space-y-4">{[["Отмены", summary.cancelledCount, summary.appointmentsCount], ["Неявки", summary.noShowCount, summary.appointmentsCount], ["Незавершённые планы", summary.unfinishedPlansCount, summary.treatmentPlansCount]].map(([label, value, total]) => <div key={String(label)}><div className="flex justify-between text-sm"><span>{label}</span><strong>{value} · {percentage(Number(value), Number(total))}%</strong></div><div className="mt-2 h-2 rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, percentage(Number(value), Number(total)))}%` }} /></div></div>)}</div>{context.can("payroll.read") && <Link href="/finance/payroll" className="mt-6 flex items-center gap-3 rounded-xl bg-[var(--surface-muted)] p-4 text-sm font-semibold hover:bg-[var(--brand-soft)]"><ReceiptText className="size-5 text-[var(--brand)]" />Расчёт вознаграждений врачей</Link>}</Card></div>
  </div>;
}
