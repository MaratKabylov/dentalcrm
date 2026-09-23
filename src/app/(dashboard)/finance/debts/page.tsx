import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronRight, Clock3, ReceiptText, Search, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDebtAgingSummary, listDebtInvoices, listFinanceBranches } from "@/modules/finance/repository";
import { debtFiltersSchema } from "@/modules/finance/schemas";
import type { DebtAgingBucket, DebtInvoiceItem } from "@/modules/finance/types";
import { getOrganizationContext } from "@/modules/organizations/repository";

const bucketLabels: Record<DebtAgingBucket | "all", string> = {
  all: "Все интервалы",
  "0_7": "0–7 дней",
  "8_30": "8–30 дней",
  "31_60": "31–60 дней",
  "61_90": "61–90 дней",
  "91_plus": "91+ дней",
};

const bucketClasses: Record<DebtAgingBucket, string> = {
  "0_7": "bg-sky-50 text-sky-800",
  "8_30": "bg-amber-50 text-amber-800",
  "31_60": "bg-orange-50 text-orange-800",
  "61_90": "bg-rose-50 text-rose-800",
  "91_plus": "bg-red-100 text-red-900",
};

type PatientDebtGroup = {
  patientId: string;
  patientName: string;
  patientExternalNumber: string;
  patientPhone: string;
  totalDebt: number;
  maximumAgeDays: number;
  invoices: DebtInvoiceItem[];
};

function groupByPatient(invoices: DebtInvoiceItem[]): PatientDebtGroup[] {
  const groups = new Map<string, PatientDebtGroup>();
  for (const invoice of invoices) {
    const existing = groups.get(invoice.patientId);
    if (existing) {
      existing.totalDebt += invoice.debtAmount;
      existing.maximumAgeDays = Math.max(existing.maximumAgeDays, invoice.ageDays);
      existing.invoices.push(invoice);
    } else {
      groups.set(invoice.patientId, {
        patientId: invoice.patientId,
        patientName: invoice.patientName,
        patientExternalNumber: invoice.patientExternalNumber,
        patientPhone: invoice.patientPhone,
        totalDebt: invoice.debtAmount,
        maximumAgeDays: invoice.ageDays,
        invoices: [invoice],
      });
    }
  }
  return [...groups.values()].sort((left, right) => right.totalDebt - left.totalDebt);
}

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branch?: string; bucket?: string }>;
}) {
  const query = await searchParams;
  const parsedFilters = debtFiltersSchema.safeParse(query);
  const filters = parsedFilters.success ? parsedFilters.data : { q: "", branch: undefined, bucket: "all" as const };
  const [summary, invoices, branches, context] = await Promise.all([
    getDebtAgingSummary(filters.branch),
    listDebtInvoices({ branchId: filters.branch, agingBucket: filters.bucket, query: filters.q }),
    listFinanceBranches(),
    getOrganizationContext(),
  ]);
  if (!context) return null;

  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", timeZone: context.organization.timezone });
  const groups = groupByPatient(invoices);
  const aging = [
    { bucket: "0_7" as const, label: "0–7", amount: summary.debt0To7, color: "bg-sky-500" },
    { bucket: "8_30" as const, label: "8–30", amount: summary.debt8To30, color: "bg-amber-500" },
    { bucket: "31_60" as const, label: "31–60", amount: summary.debt31To60, color: "bg-orange-500" },
    { bucket: "61_90" as const, label: "61–90", amount: summary.debt61To90, color: "bg-rose-500" },
    { bucket: "91_plus" as const, label: "91+", amount: summary.debt91Plus, color: "bg-red-700" },
  ];

  const bucketHref = (bucket: DebtAgingBucket) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.branch) params.set("branch", filters.branch);
    params.set("bucket", bucket);
    return `/finance/debts?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/finance" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К финансовому разделу</Link>
      <div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700"><AlertTriangle className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">Дебиторская задолженность</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Реестр должников</h1><p className="mt-2 text-sm text-[var(--muted)]">Возраст долга рассчитывается от даты выставления счёта в часовом поясе организации.</p></div></div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-[var(--muted)]">Общий долг</p><p className="mt-2 text-2xl font-semibold text-amber-700">{money.format(summary.totalDebt)}</p></div><AlertTriangle className="size-5 text-amber-700" /></div></Card>
        <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-[var(--muted)]">Пациентов</p><p className="mt-2 text-2xl font-semibold">{summary.patientCount}</p></div><UsersRound className="size-5 text-[var(--brand)]" /></div></Card>
        <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-[var(--muted)]">Неоплаченных счетов</p><p className="mt-2 text-2xl font-semibold">{summary.invoiceCount}</p></div><ReceiptText className="size-5 text-[var(--brand)]" /></div></Card>
        <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-[var(--muted)]">Максимальный возраст</p><p className="mt-2 text-2xl font-semibold">{summary.maximumAgeDays} дн.</p></div><Clock3 className="size-5 text-rose-700" /></div></Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h2 className="font-semibold">Структура долга по возрасту</h2><p className="mt-1 text-xs text-[var(--muted)]">Нажмите на интервал, чтобы отфильтровать реестр.</p></div><p className="text-xs text-[var(--muted)]">Всего {money.format(summary.totalDebt)}</p></div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          {aging.map((item) => item.amount > 0 && <div key={item.bucket} className={item.color} style={{ width: `${summary.totalDebt > 0 ? item.amount / summary.totalDebt * 100 : 0}%` }} title={`${item.label} дней: ${money.format(item.amount)}`} />)}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {aging.map((item) => <Link key={item.bucket} href={bucketHref(item.bucket)} className={filters.bucket === item.bucket ? "rounded-xl border border-[var(--brand)] bg-[var(--brand-soft)] p-3" : "rounded-xl border p-3 transition hover:bg-[var(--surface-muted)]"}><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${item.color}`} /><span className="text-xs text-[var(--muted)]">{item.label} дней</span></div><p className="mt-1 text-sm font-semibold">{money.format(item.amount)}</p></Link>)}
        </div>
      </Card>

      <Card className="p-4">
        <form action="/finance/debts" className="grid gap-3 lg:grid-cols-[1fr_220px_200px_auto_auto]">
          <div className="relative"><Search className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" /><Input name="q" defaultValue={filters.q} className="pl-10" placeholder="Пациент, телефон, счёт или номер карты" aria-label="Поиск задолженности" /></div>
          <select name="branch" defaultValue={filters.branch ?? ""} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="">Все филиалы</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <select name="bucket" defaultValue={filters.bucket} className="h-11 rounded-xl border bg-white px-3.5 text-sm">{Object.entries(bucketLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <Button type="submit" variant="secondary">Применить</Button>
          <Link href="/finance/debts"><Button type="button" variant="ghost">Сбросить</Button></Link>
        </form>
      </Card>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Пациенты с задолженностью</h2><p className="mt-1 text-sm text-[var(--muted)]">Найдено пациентов: {groups.length} · счетов: {invoices.length}</p></div></div>
        {groups.length === 0 ? (
          <Card className="grid min-h-56 place-items-center p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><ReceiptText className="size-6" /></div><h3 className="mt-4 font-semibold">Задолженность не найдена</h3><p className="mt-1 text-sm text-[var(--muted)]">Измените фильтры или поисковый запрос.</p></div></Card>
        ) : groups.map((group) => (
          <Card key={group.patientId} className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b bg-[var(--surface-muted)] p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">{context.can("patients.read") ? <Link href={`/patients/${group.patientId}/finance`} className="font-semibold hover:text-[var(--brand)]">{group.patientName}</Link> : <p className="font-semibold">{group.patientName}</p>}<p className="mt-1 text-xs text-[var(--muted)]">№ {group.patientExternalNumber} · {group.patientPhone} · {group.invoices.length} сч.</p></div>
              <div className="text-left sm:text-right"><p className="font-semibold text-amber-700">{money.format(group.totalDebt)}</p><p className="mt-1 text-xs text-[var(--muted)]">до {group.maximumAgeDays} дней</p></div>
            </div>
            <div className="divide-y">
              {group.invoices.map((invoice) => (
                <Link key={invoice.invoiceId} href={`/finance/invoices/${invoice.invoiceId}`} className="grid gap-3 p-4 transition hover:bg-[var(--surface-muted)] sm:grid-cols-[1fr_170px_150px_20px] sm:items-center">
                  <div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{invoice.invoiceNumber}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${bucketClasses[invoice.agingBucket]}`}>{bucketLabels[invoice.agingBucket]}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{invoice.branchName} · выставлен {date.format(new Date(invoice.issuedAt))}</p></div>
                  <div className="text-sm"><p className="text-xs text-[var(--muted)]">Оплачено</p><p className="mt-1">{money.format(invoice.paidAmount)} из {money.format(invoice.totalAmount)}</p></div>
                  <div className="text-left sm:text-right"><p className="text-xs text-[var(--muted)]">Остаток</p><p className="mt-1 font-semibold text-amber-700">{money.format(invoice.debtAmount)}</p></div>
                  <ChevronRight className="size-4 text-[var(--muted)]" />
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
