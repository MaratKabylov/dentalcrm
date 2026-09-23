import Link from "next/link";
import { ArrowLeft, Banknote, ReceiptText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { listPayments } from "@/modules/finance/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function PaymentsPage() {
  const [payments, context] = await Promise.all([listPayments(), getOrganizationContext()]);
  if (!context) return null;
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 2 });
  const dateTime = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: context.organization.timezone });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/finance" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К финансовому разделу</Link>
      <div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Banknote className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">Финансовый контур</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Платежи</h1><p className="mt-2 text-sm text-[var(--muted)]">Проведённые оплаты пациентов по кассовым сменам.</p></div></div>
      <Card className="overflow-hidden">
        {payments.length === 0 ? <div className="p-10 text-center text-sm text-[var(--muted)]">Платежей пока нет.</div> : <div className="divide-y">{payments.map((payment) => (
          <div key={payment.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ReceiptText className="size-5" /></div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{payment.receiptNumber}</p><span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold">{payment.paymentMethodName}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{payment.patientName} · {payment.branchName} · {payment.cashDeskName}</p><p className="mt-1 text-xs text-[var(--muted)]">{dateTime.format(new Date(payment.paidAt))}{payment.externalReference ? ` · ${payment.externalReference}` : ""}</p></div>
            <div className="text-left sm:text-right"><p className="font-semibold text-emerald-700">{money.format(payment.amount)}</p>{payment.invoiceId && payment.invoiceNumber && <Link href={`/finance/invoices/${payment.invoiceId}`} className="mt-1 block text-xs text-[var(--brand)] hover:underline">{payment.invoiceNumber}</Link>}</div>
          </div>
        ))}</div>}
      </Card>
    </div>
  );
}
