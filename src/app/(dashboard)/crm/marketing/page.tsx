import Link from "next/link";
import { ArrowLeft, BarChart3, Filter, Settings2, Target, TrendingUp, UsersRound, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MarketingCampaignManager } from "@/modules/crm/marketing-campaign-manager";
import { listCrmBranches, listMarketingAttribution, listMarketingCampaigns, listPatientSources } from "@/modules/crm/repository";
import { marketingReportFiltersSchema } from "@/modules/crm/schemas";
import type { MarketingAttributionRow } from "@/modules/crm/types";
import { getOrganizationContext } from "@/modules/organizations/repository";

function localDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function percent(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; source?: string; branch?: string }>;
}) {
  const context = await getOrganizationContext();
  if (!context) return null;
  const today = localDate(new Date(), context.organization.timezone);
  const defaultFromDate = new Date();
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  const defaultFrom = localDate(defaultFromDate, context.organization.timezone);
  const parsed = marketingReportFiltersSchema.safeParse(await searchParams);
  const requested = parsed.success ? parsed.data : { from: "", to: "" };
  const filters = {
    from: requested.from || defaultFrom,
    to: requested.to || today,
    source: requested.source,
    branch: requested.branch,
  };
  const invalidPeriod = filters.to < filters.from
    || (new Date(`${filters.to}T00:00:00Z`).getTime() - new Date(`${filters.from}T00:00:00Z`).getTime()) / 86_400_000 > 366;
  if (invalidPeriod) {
    filters.from = defaultFrom;
    filters.to = today;
  }

  const canManage = context.can("crm.manage");
  const canReadReport = context.can("reports.read");
  const [campaigns, sources, branches, rows] = await Promise.all([
    listMarketingCampaigns(canManage),
    listPatientSources(canManage),
    listCrmBranches(),
    canReadReport ? listMarketingAttribution(filters) : Promise.resolve([] as MarketingAttributionRow[]),
  ]);
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 0 });
  const totals = rows.reduce((sum, row) => ({
    budget: sum.budget + row.budgetAmount,
    leads: sum.leads + row.leadsCount,
    converted: sum.converted + row.convertedCount,
    appointments: sum.appointments + row.appointmentsCount,
    revenue: sum.revenue + row.revenueAmount,
  }), { budget: 0, leads: 0, converted: 0, appointments: 0, revenue: 0 });
  const totalRoi = totals.budget > 0 ? (totals.revenue - totals.budget) / totals.budget : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><Link href="/crm/leads" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К лидам</Link><p className="mt-4 text-sm font-semibold text-[var(--brand)]">CRM · сквозная атрибуция</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Маркетинг</h1><p className="mt-2 text-sm text-[var(--muted)]">Кампании, конверсия в пациента, записи, выручка и ROI.</p></div>
        <Link href="/crm/sources"><Button variant="secondary"><Settings2 className="size-4" />Источники</Button></Link>
      </div>

      {canManage && <section className="space-y-4"><div><h2 className="text-xl font-semibold">Управление кампаниями</h2><p className="mt-1 text-sm text-[var(--muted)]">Создавайте кампании до привязки их к новым лидам.</p></div><MarketingCampaignManager campaigns={campaigns} sources={sources} branches={branches} today={today} currency={context.organization.currency} /></section>}

      <section className="space-y-4">
        <div><h2 className="text-xl font-semibold">Результаты</h2><p className="mt-1 text-sm text-[var(--muted)]">Когорта лидов по дате создания; записи и оплаты учитываются после появления лида.</p></div>
        {!canReadReport ? <Card className="p-6"><p className="text-sm text-[var(--muted)]">Для просмотра финансовой атрибуции требуется право «Просмотр отчётов».</p></Card> : <>
          <Card className="p-4"><form action="/crm/marketing" className="grid gap-3 lg:grid-cols-[170px_170px_1fr_1fr_auto_auto]"><Input name="from" type="date" defaultValue={filters.from} aria-label="Начало периода" /><Input name="to" type="date" defaultValue={filters.to} aria-label="Конец периода" /><select name="source" defaultValue={filters.source ?? ""} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="">Все источники</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><select name="branch" defaultValue={filters.branch ?? ""} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="">Все филиалы</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><Button type="submit" variant="secondary"><Filter className="size-4" />Применить</Button><Link href="/crm/marketing"><Button type="button" variant="ghost">Сбросить</Button></Link></form></Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-[var(--muted)]">Лиды</p><p className="mt-2 text-2xl font-semibold">{totals.leads}</p><p className="mt-1 text-xs text-[var(--muted)]">Конверсия {totals.leads ? percent(totals.converted / totals.leads) : "—"}</p></div><UsersRound className="size-5 text-[var(--brand)]" /></div></Card>
            <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-[var(--muted)]">Записи</p><p className="mt-2 text-2xl font-semibold">{totals.appointments}</p><p className="mt-1 text-xs text-[var(--muted)]">После создания лида</p></div><Target className="size-5 text-[var(--brand)]" /></div></Card>
            <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-[var(--muted)]">Чистые оплаты</p><p className="mt-2 text-2xl font-semibold">{money.format(totals.revenue)}</p><p className="mt-1 text-xs text-[var(--muted)]">С учётом возвратов</p></div><WalletCards className="size-5 text-[var(--brand)]" /></div></Card>
            <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-[var(--muted)]">ROI</p><p className={totalRoi !== null && totalRoi < 0 ? "mt-2 text-2xl font-semibold text-rose-700" : "mt-2 text-2xl font-semibold text-emerald-700"}>{totalRoi === null ? "—" : percent(totalRoi)}</p><p className="mt-1 text-xs text-[var(--muted)]">Бюджет {money.format(totals.budget)}</p></div><TrendingUp className="size-5 text-[var(--brand)]" /></div></Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b px-5 py-4"><BarChart3 className="size-5 text-[var(--brand)]" /><div><h2 className="font-semibold">Кампании и источники</h2><p className="mt-0.5 text-xs text-[var(--muted)]">{rows.length} строк в отчёте.</p></div></div>
            {rows.length === 0 ? <div className="grid min-h-52 place-items-center p-8 text-center"><div><h3 className="font-semibold">Данных за период нет</h3><p className="mt-1 text-sm text-[var(--muted)]">Измените период или начните привязывать кампании к лидам.</p></div></div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-[var(--surface-muted)] text-xs text-[var(--muted)]"><tr><th className="px-5 py-3 font-semibold">Кампания</th><th className="px-4 py-3 font-semibold">Лиды</th><th className="px-4 py-3 font-semibold">Пациенты</th><th className="px-4 py-3 font-semibold">Записи</th><th className="px-4 py-3 font-semibold">Завершено</th><th className="px-4 py-3 font-semibold">Бюджет</th><th className="px-4 py-3 font-semibold">Выручка</th><th className="px-4 py-3 font-semibold">ROI</th></tr></thead><tbody className="divide-y">{rows.map((row) => {
              const roi = row.budgetAmount > 0 ? (row.revenueAmount - row.budgetAmount) / row.budgetAmount : null;
              return <tr key={`${row.campaignId ?? "organic"}-${row.sourceId}-${row.branchId ?? "all"}`}><td className="px-5 py-4"><p className="font-semibold">{row.campaignName}</p><p className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]"><span className="size-2 rounded-full" style={{ backgroundColor: row.sourceColor }} />{row.sourceName} · {row.branchName ?? "Все филиалы"}</p></td><td className="px-4 py-4 font-medium">{row.leadsCount}</td><td className="px-4 py-4"><p className="font-medium">{row.convertedCount}</p><p className="text-xs text-[var(--muted)]">{row.leadsCount ? percent(row.convertedCount / row.leadsCount) : "—"}</p></td><td className="px-4 py-4">{row.appointmentsCount}</td><td className="px-4 py-4">{row.completedAppointmentsCount}</td><td className="px-4 py-4">{money.format(row.budgetAmount)}</td><td className="px-4 py-4 font-semibold">{money.format(row.revenueAmount)}</td><td className={roi !== null && roi < 0 ? "px-4 py-4 font-semibold text-rose-700" : "px-4 py-4 font-semibold text-emerald-700"}>{roi === null ? "—" : percent(roi)}</td></tr>;
            })}</tbody></table></div>}
          </Card>
        </>}
      </section>
    </div>
  );
}
