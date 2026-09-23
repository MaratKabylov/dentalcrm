import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleUserRound, ReceiptText, Stethoscope } from "lucide-react";

import { Card } from "@/components/ui/card";
import { InvoicePaymentForm } from "@/modules/finance/invoice-payment-form";
import { getInvoice, listCashDesks, listInvoiceItems, listPaymentMethods } from "@/modules/finance/repository";
import { invoiceIdSchema } from "@/modules/finance/schemas";
import type { InvoiceStatus } from "@/modules/finance/types";
import { getOrganizationContext } from "@/modules/organizations/repository";

const statusLabels: Record<InvoiceStatus, string> = {
  issued: "К оплате",
  partially_paid: "Частично оплачен",
  paid: "Оплачен",
};

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = invoiceIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [invoice, items, cashDesks, paymentMethods, context] = await Promise.all([
    getInvoice(parsedId.data),
    listInvoiceItems(parsedId.data),
    listCashDesks(),
    listPaymentMethods(),
    getOrganizationContext(),
  ]);
  if (!invoice || !context) notFound();

  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 2 });
  const issuedAt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: context.organization.timezone }).format(new Date(invoice.issuedAt));
  const statusClassName = invoice.status === "paid"
    ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
    : invoice.status === "partially_paid"
      ? "rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800"
      : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/finance" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К списку счетов</Link>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><ReceiptText className="size-6" /></div>
          <div><p className="text-sm font-semibold text-[var(--brand)]">Счёт пациента</p><div className="mt-1 flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-[-0.04em]">{invoice.invoiceNumber}</h1><span className={statusClassName}>{statusLabels[invoice.status]}</span></div><p className="mt-2 text-sm text-[var(--muted)]">Выставлен {issuedAt} · {invoice.branchName}</p></div>
        </div>
        <div className="text-left sm:text-right"><p className="text-xs text-[var(--muted)]">Итого</p><p className="mt-1 text-2xl font-semibold">{money.format(invoice.totalAmount)}</p></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5"><div className="flex gap-3"><CircleUserRound className="mt-0.5 size-5 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Пациент</p>{context.can("patients.read") ? <Link href={`/patients/${invoice.patientId}`} className="mt-1 block font-semibold hover:text-[var(--brand)]">{invoice.patientName}</Link> : <p className="mt-1 font-semibold">{invoice.patientName}</p>}<p className="mt-1 text-xs text-[var(--muted)]">№ {invoice.patientExternalNumber}</p></div></div></Card>
        <Card className="p-5"><div className="flex gap-3"><Stethoscope className="mt-0.5 size-5 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Основание</p>{invoice.encounterId && context.can("clinical.read") ? <Link href={`/clinical/encounters/${invoice.encounterId}`} className="mt-1 block font-semibold hover:text-[var(--brand)]">Врачебный приём</Link> : <p className="mt-1 font-semibold">{invoice.encounterId ? "Врачебный приём" : "Ручной счёт"}</p>}</div></div></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-5"><h2 className="font-semibold">Позиции счёта</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--surface-muted)] text-xs text-[var(--muted)]"><tr><th className="px-5 py-3 font-medium">Описание</th><th className="px-4 py-3 text-right font-medium">Количество</th><th className="px-4 py-3 text-right font-medium">Цена</th><th className="px-4 py-3 text-right font-medium">Скидка</th><th className="px-5 py-3 text-right font-medium">Сумма</th></tr></thead>
            <tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="px-5 py-4 font-medium">{item.description}</td><td className="px-4 py-4 text-right">{item.quantity}</td><td className="px-4 py-4 text-right">{money.format(item.unitPrice)}</td><td className="px-4 py-4 text-right">{money.format(item.discountAmount)}</td><td className="px-5 py-4 text-right font-semibold">{money.format(item.amount)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="ml-auto grid max-w-sm gap-2 border-t p-5 text-sm">
          <div className="flex justify-between gap-5"><span className="text-[var(--muted)]">Подытог</span><span>{money.format(invoice.subtotal)}</span></div>
          <div className="flex justify-between gap-5"><span className="text-[var(--muted)]">Скидка</span><span>{money.format(invoice.discountAmount)}</span></div>
          <div className="flex justify-between gap-5 border-t pt-2 text-base font-semibold"><span>Итого</span><span>{money.format(invoice.totalAmount)}</span></div>
          <div className="flex justify-between gap-5"><span className="text-[var(--muted)]">Оплачено</span><span>{money.format(invoice.paidAmount)}</span></div>
          <div className="flex justify-between gap-5 font-semibold text-amber-700"><span>Остаток</span><span>{money.format(invoice.debtAmount)}</span></div>
        </div>
      </Card>

      {invoice.debtAmount > 0 && context.can("cashdesk.manage") && (
        <InvoicePaymentForm
          key={`${invoice.id}-${invoice.debtAmount}`}
          invoiceId={invoice.id}
          debtAmount={invoice.debtAmount}
          cashDesks={cashDesks.filter((desk) => desk.branchId === invoice.branchId && desk.isActive)}
          paymentMethods={paymentMethods}
          currency={context.organization.currency}
        />
      )}
    </div>
  );
}
