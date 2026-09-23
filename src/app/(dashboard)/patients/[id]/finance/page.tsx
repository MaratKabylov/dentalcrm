import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ChevronRight, CircleDollarSign } from "lucide-react";

import { Card } from "@/components/ui/card";
import { getInvoiceSummary, listInvoices, listPatientLedger } from "@/modules/finance/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { getPatient } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/schemas";

export default async function PatientFinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = patientIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [patient, invoices, summary, ledger, context] = await Promise.all([
    getPatient(parsedId.data),
    listInvoices(parsedId.data),
    getInvoiceSummary(parsedId.data),
    listPatientLedger(parsedId.data),
    getOrganizationContext(),
  ]);
  if (!patient || !context) notFound();

  const patientName = [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ");
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={`/patients/${patient.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К карточке пациента</Link>
      <div className="flex items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><CircleDollarSign className="size-6" /></div>
        <div><p className="text-sm font-semibold text-[var(--brand)]">Финансы пациента</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{patientName}</h1><p className="mt-2 text-sm text-[var(--muted)]">№ {patient.externalNumber}</p></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5"><p className="text-sm text-[var(--muted)]">Счетов</p><p className="mt-2 text-3xl font-semibold">{summary.invoiceCount}</p></Card>
        <Card className="p-5"><p className="text-sm text-[var(--muted)]">К оплате</p><p className="mt-2 text-3xl font-semibold text-amber-700">{money.format(summary.debtAmount)}</p></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-5"><h2 className="font-semibold">Счета пациента</h2></div>
        {invoices.length === 0 ? <div className="p-8 text-center text-sm text-[var(--muted)]">Счета ещё не выставлены.</div> : <div className="divide-y">{invoices.map((invoice) => (
          <Link key={invoice.id} href={`/finance/invoices/${invoice.id}`} className="flex items-center gap-4 p-5 transition hover:bg-[var(--surface-muted)]">
            <div className="min-w-0 flex-1"><p className="font-semibold">{invoice.invoiceNumber}</p><p className="mt-1 text-xs text-[var(--muted)]">{invoice.branchName} · {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: context.organization.timezone }).format(new Date(invoice.issuedAt))}</p></div>
            <div className="text-right"><p className="font-semibold">{money.format(invoice.totalAmount)}</p>{invoice.debtAmount > 0 && <p className="mt-1 text-xs text-amber-700">К оплате {money.format(invoice.debtAmount)}</p>}</div>
            <ChevronRight className="size-4 text-[var(--muted)]" />
          </Link>
        ))}</div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-5"><h2 className="font-semibold">Лицевой счёт</h2><p className="mt-1 text-xs text-[var(--muted)]">Начисления и оплаты в хронологическом порядке.</p></div>
        {ledger.length === 0 ? <div className="p-8 text-center text-sm text-[var(--muted)]">Проводок пока нет.</div> : <div className="divide-y">{ledger.map((entry) => {
          const isCharge = entry.debitAmount > 0;
          return (
            <div key={entry.id} className="flex items-center gap-4 p-5">
              <div className={isCharge ? "grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700" : "grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"}>{isCharge ? <ArrowUpRight className="size-4" /> : <ArrowDownLeft className="size-4" />}</div>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{entry.description}</p><p className="mt-1 text-xs text-[var(--muted)]">{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: context.organization.timezone }).format(new Date(entry.occurredAt))}</p></div>
              <div className="text-right"><p className={isCharge ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>{isCharge ? "+" : "−"}{money.format(isCharge ? entry.debitAmount : entry.creditAmount)}</p>{entry.invoiceId && entry.invoiceNumber && <Link href={`/finance/invoices/${entry.invoiceId}`} className="mt-1 block text-xs text-[var(--brand)] hover:underline">{entry.invoiceNumber}</Link>}</div>
            </div>
          );
        })}</div>}
      </Card>
    </div>
  );
}
