import Link from "next/link";
import { Banknote, ChevronRight, CircleDollarSign, FileCheck2, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createInvoiceFromEncounter } from "@/modules/finance/actions";
import { getInvoiceSummary, listBillableEncounters, listInvoices } from "@/modules/finance/repository";
import type { InvoiceStatus } from "@/modules/finance/types";
import { getOrganizationContext } from "@/modules/organizations/repository";

const statusLabels: Record<InvoiceStatus, string> = {
  issued: "К оплате",
  partially_paid: "Частично оплачен",
  paid: "Оплачен",
};

function statusClassName(status: InvoiceStatus) {
  if (status === "paid") return "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800";
  if (status === "partially_paid") return "rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800";
  return "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800";
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export default async function FinancePage() {
  const [invoices, billableEncounters, summary, context] = await Promise.all([
    listInvoices(),
    listBillableEncounters(),
    getInvoiceSummary(),
    getOrganizationContext(),
  ]);
  if (!context) return null;

  const money = new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency: context.organization.currency,
    maximumFractionDigits: 2,
  });
  const canManage = context.can("finance.manage");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-[var(--brand)]">Финансовый контур</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Счета пациентов</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Счета формируются из фактически выполненных процедур закрытого приёма.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><div className="flex items-center gap-3"><ReceiptText className="size-5 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Выставлено счетов</p><p className="mt-1 text-2xl font-semibold">{summary.invoiceCount}</p></div></div></Card>
        <Card className="p-5"><div className="flex items-center gap-3"><CircleDollarSign className="size-5 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Сумма счетов</p><p className="mt-1 text-2xl font-semibold">{money.format(summary.totalAmount)}</p></div></div></Card>
        <Card className="p-5"><div className="flex items-center gap-3"><Banknote className="size-5 text-amber-700" /><div><p className="text-xs text-[var(--muted)]">К оплате</p><p className="mt-1 text-2xl font-semibold">{money.format(summary.debtAmount)}</p></div></div></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b p-5">
          <div><h2 className="font-semibold">Готовы к выставлению</h2><p className="mt-1 text-xs text-[var(--muted)]">Закрытые приёмы с ещё не выставленными процедурами.</p></div>
          <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-semibold">{billableEncounters.length}</span>
        </div>
        {billableEncounters.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted)]">Нет приёмов, ожидающих выставления счёта.</div>
        ) : (
          <div className="divide-y">
            {billableEncounters.map((encounter) => (
              <div key={encounter.encounterId} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><FileCheck2 className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{encounter.patientName}</p><span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold">№ {encounter.patientExternalNumber}</span></div>
                  <p className="mt-1 text-xs text-[var(--muted)]">{encounter.doctorName} · {encounter.branchName} · закрыт {formatDate(encounter.closedAt, context.organization.timezone)}</p>
                  <p className="mt-2 text-xs">{encounter.procedureCount} процедур · <span className="font-semibold">{money.format(encounter.totalAmount)}</span></p>
                </div>
                {canManage ? (
                  <form action={createInvoiceFromEncounter}>
                    <input type="hidden" name="encounterId" value={encounter.encounterId} />
                    <Button><ReceiptText className="size-4" />Выставить счёт</Button>
                  </form>
                ) : <span className="text-xs text-[var(--muted)]">Требуется право управления финансами</span>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-5"><h2 className="font-semibold">Последние счета</h2></div>
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted)]">Счета ещё не выставлены.</div>
        ) : (
          <div className="divide-y">
            {invoices.map((invoice) => (
              <Link key={invoice.id} href={`/finance/invoices/${invoice.id}`} className="flex items-center gap-4 p-5 transition hover:bg-[var(--surface-muted)]">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{invoice.invoiceNumber}</p><span className={statusClassName(invoice.status)}>{statusLabels[invoice.status]}</span></div>
                  <p className="mt-1 text-xs text-[var(--muted)]">{invoice.patientName} · № {invoice.patientExternalNumber} · {invoice.branchName}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(invoice.issuedAt, context.organization.timezone)}</p>
                </div>
                <div className="text-right"><p className="font-semibold">{money.format(invoice.totalAmount)}</p>{invoice.debtAmount > 0 && <p className="mt-1 text-xs text-amber-700">Долг {money.format(invoice.debtAmount)}</p>}</div>
                <ChevronRight className="size-4 shrink-0 text-[var(--muted)]" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
