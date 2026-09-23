import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, CircleDollarSign } from "lucide-react";

import { Card } from "@/components/ui/card";
import { getInvoiceSummary, listInvoices } from "@/modules/finance/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { getPatient } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/schemas";

export default async function PatientFinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = patientIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [patient, invoices, summary, context] = await Promise.all([
    getPatient(parsedId.data),
    listInvoices(parsedId.data),
    getInvoiceSummary(parsedId.data),
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
    </div>
  );
}
