import Link from "next/link";
import { ArrowLeft, Banknote } from "lucide-react";

import { PaymentHistory } from "@/modules/finance/payment-history";
import { listCashDesks, listPaymentMethods, listPaymentRefunds, listPayments } from "@/modules/finance/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function PaymentsPage() {
  const [payments, refunds, cashDesks, paymentMethods, context] = await Promise.all([
    listPayments(),
    listPaymentRefunds(),
    listCashDesks(),
    listPaymentMethods(),
    getOrganizationContext(),
  ]);
  if (!context) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/finance" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К финансовому разделу</Link>
      <div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Banknote className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">Финансовый контур</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Платежи</h1><p className="mt-2 text-sm text-[var(--muted)]">Проведённые оплаты пациентов по кассовым сменам.</p></div></div>
      <PaymentHistory
        payments={payments}
        refunds={refunds}
        cashDesks={cashDesks}
        paymentMethods={paymentMethods}
        currency={context.organization.currency}
        timeZone={context.organization.timezone}
        canManage={context.can("finance.manage") && context.can("cashdesk.manage")}
      />
    </div>
  );
}
