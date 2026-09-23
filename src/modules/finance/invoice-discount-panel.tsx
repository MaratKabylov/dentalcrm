"use client";

import { useActionState, useMemo, useState } from "react";
import { BadgePercent, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initialFormState } from "@/modules/auth/types";
import { applyInvoiceDiscount } from "@/modules/finance/actions";
import type { DiscountApplication, DiscountDefinition } from "@/modules/finance/types";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

export function InvoiceDiscountPanel({
  invoiceId,
  subtotal,
  debtAmount,
  discounts,
  applications,
  maxDiscountPercent,
  currency,
  timeZone,
  canManage,
}: {
  invoiceId: string;
  subtotal: number;
  debtAmount: number;
  discounts: DiscountDefinition[];
  applications: DiscountApplication[];
  maxDiscountPercent: number;
  currency: string;
  timeZone: string;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(applyInvoiceDiscount, initialFormState);
  const [selectedId, setSelectedId] = useState(discounts[0]?.id ?? "");
  const selected = discounts.find((discount) => discount.id === selectedId);
  const money = useMemo(() => new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }), [currency]);
  const dateTime = useMemo(() => new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }), [timeZone]);
  const alreadyApplied = applications.reduce((sum, application) => sum + application.discountAmount, 0);
  const maximumByRole = Math.round(subtotal * maxDiscountPercent) / 100;
  const remainingRoleLimit = Math.max(0, maximumByRole - alreadyApplied);
  const calculatedAmount = selected
    ? selected.type === "percentage"
      ? Math.round(subtotal * selected.value) / 100
      : selected.value
    : 0;
  const canApplySelected = calculatedAmount > 0
    && calculatedAmount <= debtAmount
    && calculatedAmount <= remainingRoleLimit;

  return (
    <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="font-semibold">Скидки по счёту</h2><p className="mt-1 text-xs text-[var(--muted)]">Каждое применение сохраняет основание, автора и суммы до и после.</p></div>
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><BadgePercent className="size-5" /></div>
      </div>

      {canManage && debtAmount > 0 && (
        discounts.length > 0 && maxDiscountPercent > 0 ? (
          <form action={formAction} className="space-y-4 rounded-xl bg-[var(--surface-muted)] p-4">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">Скидка *</span>
                <select name="discountId" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm">
                  {discounts.map((discount) => (
                    <option key={discount.id} value={discount.id}>{discount.name} · {discount.type === "percentage" ? `${discount.value}%` : money.format(discount.value)}</option>
                  ))}
                </select>
                <FieldError errors={state.fieldErrors?.discountId} />
              </label>
              <div className="rounded-xl border bg-white px-4 py-3 text-sm">
                <p className="text-xs text-[var(--muted)]">Расчётная сумма</p>
                <p className="mt-1 font-semibold">{money.format(calculatedAmount)}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">Ваш лимит: {maxDiscountPercent}% · доступно {money.format(Math.min(debtAmount, remainingRoleLimit))}</p>
              </div>
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Основание *</span>
              <textarea name="reason" minLength={3} maxLength={500} required className="min-h-20 w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" placeholder="Например: постоянный пациент, согласовано с руководителем" />
              <FieldError errors={state.fieldErrors?.reason} />
            </label>
            {!canApplySelected && selected && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Эта скидка превышает неоплаченный остаток или доступный ролевой лимит.</p>}
            {state.message && <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" : "rounded-xl bg-red-50 px-3 py-2 text-xs text-[var(--danger)]"}>{state.message}</div>}
            <div className="flex justify-end"><Button disabled={pending || !canApplySelected}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <BadgePercent className="size-4" />}{pending ? "Применение…" : "Применить скидку"}</Button></div>
          </form>
        ) : (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Нет доступных скидок или ваша роль имеет нулевой лимит.</p>
        )
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">История применений</h3>
        {applications.length === 0 ? (
          <p className="rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--muted)]">Дополнительные скидки ещё не применялись.</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {applications.map((application) => (
              <div key={application.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{application.discountName}</p><span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">{application.discountType === "percentage" ? `${application.discountValue}%` : money.format(application.discountValue)}</span></div>
                  <p className="mt-1 text-xs text-slate-700">{application.reason}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{application.appliedByName || "Пользователь"} · {dateTime.format(new Date(application.appliedAt))}</p>
                </div>
                <div className="text-left sm:text-right"><p className="font-semibold text-violet-700">−{money.format(application.discountAmount)}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{money.format(application.amountBefore)} → {money.format(application.amountAfter)}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
