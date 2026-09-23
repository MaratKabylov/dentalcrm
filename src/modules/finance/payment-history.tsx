"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LoaderCircle, ReceiptText, RotateCcw, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState, type FormActionState } from "@/modules/auth/types";
import { recordPaymentRefund, reversePayment } from "@/modules/finance/actions";
import type {
  CashDeskState,
  PaymentListItem,
  PaymentMethod,
  PaymentRefundListItem,
} from "@/modules/finance/types";

const statusLabels: Record<PaymentListItem["status"], string> = {
  posted: "Проведён",
  partially_refunded: "Частично возвращён",
  refunded: "Возвращён",
  reversed: "Сторнирован",
};

const statusClassNames: Record<PaymentListItem["status"], string> = {
  posted: "bg-emerald-50 text-emerald-800",
  partially_refunded: "bg-amber-50 text-amber-800",
  refunded: "bg-rose-50 text-rose-800",
  reversed: "bg-slate-100 text-slate-700",
};

function ActionMessage({ state }: { state: FormActionState }) {
  if (!state.message) return null;
  return (
    <div
      role="status"
      className={state.status === "success"
        ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        : "rounded-xl bg-red-50 px-3 py-2 text-xs text-[var(--danger)]"}
    >
      {state.message}
    </div>
  );
}

function ReversePaymentForm({ payment }: { payment: PaymentListItem }) {
  const [state, formAction, pending] = useActionState(reversePayment, initialFormState);
  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-white p-4">
      <input type="hidden" name="paymentId" value={payment.id} />
      <input type="hidden" name="patientId" value={payment.patientId} />
      <div>
        <p className="text-sm font-semibold">Сторнировать ошибочный платёж</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Только полная отмена в исходной открытой смене.</p>
      </div>
      <label className="block space-y-2">
        <span className="text-xs font-medium">Причина</span>
        <textarea
          name="reason"
          minLength={3}
          maxLength={500}
          required
          className="min-h-20 w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
          placeholder="Например: платёж внесён дважды"
        />
      </label>
      {state.fieldErrors?.reason?.[0] && <p className="text-xs text-[var(--danger)]">{state.fieldErrors.reason[0]}</p>}
      <ActionMessage state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="w-full">
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
        {pending ? "Сторнирование…" : "Сторнировать платёж"}
      </Button>
    </form>
  );
}

function RefundPaymentForm({
  payment,
  availableAmount,
  cashDesks,
  paymentMethods,
}: {
  payment: PaymentListItem;
  availableAmount: number;
  cashDesks: CashDeskState[];
  paymentMethods: PaymentMethod[];
}) {
  const [state, formAction, pending] = useActionState(recordPaymentRefund, initialFormState);
  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-white p-4">
      <input type="hidden" name="paymentId" value={payment.id} />
      <input type="hidden" name="patientId" value={payment.patientId} />
      <input type="hidden" name="invoiceId" value={payment.invoiceId ?? ""} />
      <div>
        <p className="text-sm font-semibold">Оформить возврат пациенту</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Можно вернуть всю доступную сумму или её часть.</p>
      </div>
      <label className="block space-y-2">
        <span className="text-xs font-medium">Кассовая смена</span>
        <select name="cashShiftId" required defaultValue={cashDesks[0]?.openShiftId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
          {cashDesks.map((desk) => <option key={desk.openShiftId} value={desk.openShiftId ?? ""}>{desk.name} · {desk.branchName}</option>)}
        </select>
      </label>
      <label className="block space-y-2">
        <span className="text-xs font-medium">Способ возврата</span>
        <select name="paymentMethodId" required defaultValue={paymentMethods.find((method) => method.code === payment.paymentMethodCode)?.id ?? paymentMethods[0]?.id} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
          {paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
        </select>
      </label>
      <label className="block space-y-2">
        <span className="text-xs font-medium">Сумма возврата</span>
        <Input name="amount" type="number" min="0.01" max={availableAmount} step="0.01" defaultValue={availableAmount} required />
      </label>
      <label className="block space-y-2">
        <span className="text-xs font-medium">Причина</span>
        <textarea name="reason" minLength={3} maxLength={500} required className="min-h-20 w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" placeholder="Причина возврата" />
      </label>
      <label className="block space-y-2">
        <span className="text-xs font-medium">Внешний номер <span className="text-[var(--muted)]">(необязательно)</span></span>
        <Input name="externalReference" maxLength={200} placeholder="Чек банка или перевода" />
      </label>
      <ActionMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        {pending ? "Оформление…" : "Оформить возврат"}
      </Button>
    </form>
  );
}

export function PaymentHistory({
  payments,
  refunds,
  cashDesks,
  paymentMethods,
  currency,
  timeZone,
  canManage,
}: {
  payments: PaymentListItem[];
  refunds: PaymentRefundListItem[];
  cashDesks: CashDeskState[];
  paymentMethods: PaymentMethod[];
  currency: string;
  timeZone: string;
  canManage: boolean;
}) {
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 2 });
  const dateTime = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone });

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        {payments.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--muted)]">Платежей пока нет.</div>
        ) : (
          <div className="divide-y">
            {payments.map((payment) => {
              const availableAmount = payment.amount - payment.refundedAmount;
              const openCashDesks = cashDesks.filter((desk) => desk.branchId === payment.branchId && desk.isActive && desk.openShiftId);
              const canReverse = canManage && payment.status === "posted" && payment.cashShiftStatus === "open";
              const canRefund = canManage && payment.invoiceId && availableAmount > 0 && payment.status !== "reversed" && openCashDesks.length > 0;
              return (
                <div key={payment.id} className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className={payment.status === "posted" ? "grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700" : "grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted)]"}><ReceiptText className="size-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{payment.receiptNumber}</p>
                        <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold">{payment.paymentMethodName}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClassNames[payment.status]}`}>{statusLabels[payment.status]}</span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted)]">{payment.patientName} · {payment.branchName} · {payment.cashDeskName}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{dateTime.format(new Date(payment.paidAt))}{payment.externalReference ? ` · ${payment.externalReference}` : ""}</p>
                      {payment.reversalReason && <p className="mt-2 text-xs text-slate-700">Причина сторно: {payment.reversalReason}</p>}
                    </div>
                    <div className="text-left sm:text-right">
                      <p className={payment.status === "reversed" ? "font-semibold text-[var(--muted)] line-through" : "font-semibold text-emerald-700"}>{money.format(payment.amount)}</p>
                      {payment.refundedAmount > 0 && <p className="mt-1 text-xs font-medium text-rose-700">Возвращено: {money.format(payment.refundedAmount)}</p>}
                      {payment.invoiceId && payment.invoiceNumber && <Link href={`/finance/invoices/${payment.invoiceId}`} className="mt-1 block text-xs text-[var(--brand)] hover:underline">{payment.invoiceNumber}</Link>}
                    </div>
                  </div>

                  {canManage && payment.status !== "reversed" && availableAmount > 0 && (
                    <details className="mt-4 rounded-xl bg-[var(--surface-muted)]">
                      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Возврат или сторно</summary>
                      <div className="grid gap-3 border-t p-4 lg:grid-cols-2">
                        {canRefund ? (
                          <RefundPaymentForm payment={payment} availableAmount={availableAmount} cashDesks={openCashDesks} paymentMethods={paymentMethods} />
                        ) : (
                          <div className="rounded-xl border bg-white p-4 text-xs text-[var(--muted)]">Для возврата нужна открытая кассовая смена в филиале платежа.</div>
                        )}
                        {canReverse ? (
                          <ReversePaymentForm payment={payment} />
                        ) : (
                          <div className="rounded-xl border bg-white p-4 text-xs text-[var(--muted)]">Сторно доступно только до закрытия исходной смены и до первого возврата.</div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">История возвратов</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Отдельные расходные операции по ранее проведённым платежам.</p>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          {refunds.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">Возвратов пока нет.</div>
          ) : (
            <div className="divide-y">
              {refunds.map((refund) => (
                <div key={refund.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700"><RotateCcw className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{refund.refundNumber}</p><span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold">{refund.paymentMethodName}</span></div>
                    <p className="mt-1 text-xs text-[var(--muted)]">{refund.patientName} · по оплате {refund.receiptNumber}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{dateTime.format(new Date(refund.refundedAt))} · {refund.branchName} · {refund.cashDeskName}</p>
                    <p className="mt-2 text-xs text-slate-700">{refund.reason}{refund.externalReference ? ` · ${refund.externalReference}` : ""}</p>
                  </div>
                  <div className="text-left sm:text-right"><p className="font-semibold text-rose-700">−{money.format(refund.amount)}</p><Link href={`/finance/invoices/${refund.invoiceId}`} className="mt-1 block text-xs text-[var(--brand)] hover:underline">{refund.invoiceNumber}</Link></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
