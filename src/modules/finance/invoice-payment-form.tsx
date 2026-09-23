"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Banknote, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { recordInvoicePayment } from "@/modules/finance/actions";
import type { CashDeskState, PaymentMethod } from "@/modules/finance/types";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

export function InvoicePaymentForm({
  invoiceId,
  debtAmount,
  cashDesks,
  paymentMethods,
  currency,
}: {
  invoiceId: string;
  debtAmount: number;
  cashDesks: CashDeskState[];
  paymentMethods: PaymentMethod[];
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(recordInvoicePayment, initialFormState);
  const openDesks = cashDesks.filter((desk) => desk.openShiftId);
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 2 });

  if (openDesks.length === 0) {
    return <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Для приёма платежа сначала <Link href="/finance/cash" className="font-semibold underline">откройте кассовую смену</Link>.</div>;
  }

  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-[var(--surface-muted)] p-4 sm:p-5">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Принять оплату</h2><p className="mt-1 text-xs text-[var(--muted)]">Остаток по счёту: {money.format(debtAmount)}</p></div><Banknote className="size-5 text-[var(--brand)]" /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2"><span className="text-sm font-medium">Касса и смена *</span><select name="cashShiftId" defaultValue={openDesks[0]?.openShiftId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm" required>{openDesks.map((desk) => <option key={desk.openShiftId} value={desk.openShiftId ?? ""}>{desk.branchName} · {desk.name}</option>)}</select><FieldError errors={state.fieldErrors?.cashShiftId} /></label>
        <label className="space-y-2"><span className="text-sm font-medium">Способ оплаты *</span><select name="paymentMethodId" defaultValue={paymentMethods[0]?.id ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm" required>{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select><FieldError errors={state.fieldErrors?.paymentMethodId} /></label>
        <label className="space-y-2"><span className="text-sm font-medium">Сумма *</span><Input name="amount" type="number" min="0.01" max={debtAmount} step="0.01" defaultValue={debtAmount} required /><FieldError errors={state.fieldErrors?.amount} /></label>
        <label className="space-y-2"><span className="text-sm font-medium">Внешняя ссылка</span><Input name="externalReference" maxLength={200} placeholder="Чек терминала или номер перевода" /><FieldError errors={state.fieldErrors?.externalReference} /></label>
      </div>
      {state.message && <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" : "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"}>{state.message}</div>}
      <div className="flex justify-end"><Button disabled={pending || paymentMethods.length === 0}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Banknote className="size-4" />}{pending ? "Проведение…" : "Провести платёж"}</Button></div>
    </form>
  );
}
