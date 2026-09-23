"use client";

import { useActionState } from "react";
import { Banknote, CheckCircle2, LoaderCircle, LockKeyhole, UnlockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { closeCashShift, openCashShift } from "@/modules/finance/actions";
import type { CashDeskState } from "@/modules/finance/types";

function ActionMessage({ state }: { state: typeof initialFormState }) {
  if (!state.message) return null;
  return <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" : "rounded-xl bg-red-50 px-3 py-2 text-xs text-[var(--danger)]"}>{state.message}</div>;
}

function OpenShiftForm({ cashDeskId }: { cashDeskId: string }) {
  const [state, formAction, pending] = useActionState(openCashShift, initialFormState);
  return (
    <form action={formAction} className="mt-4 space-y-3 border-t pt-4">
      <input type="hidden" name="cashDeskId" value={cashDeskId} />
      <label className="block space-y-2"><span className="text-xs font-medium">Наличные на начало смены</span><Input name="openingBalance" type="number" min="0" step="0.01" defaultValue="0" required /></label>
      <ActionMessage state={state} />
      <Button disabled={pending} className="w-full">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <UnlockKeyhole className="size-4" />}{pending ? "Открытие…" : "Открыть смену"}</Button>
    </form>
  );
}

function CloseShiftForm({ shiftId, expectedBalance }: { shiftId: string; expectedBalance: number }) {
  const [state, formAction, pending] = useActionState(closeCashShift, initialFormState);
  return (
    <form action={formAction} className="mt-4 space-y-3 border-t pt-4">
      <input type="hidden" name="shiftId" value={shiftId} />
      <label className="block space-y-2"><span className="text-xs font-medium">Фактически в кассе</span><Input name="closingBalance" type="number" min="0" step="0.01" defaultValue={expectedBalance} required /></label>
      <ActionMessage state={state} />
      <Button disabled={pending} variant="secondary" className="w-full">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}{pending ? "Закрытие…" : "Закрыть смену"}</Button>
    </form>
  );
}

export function CashDeskManager({
  cashDesks,
  currency,
  timeZone,
  canManage,
}: {
  cashDesks: CashDeskState[];
  currency: string;
  timeZone: string;
  canManage: boolean;
}) {
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 2 });
  const dateTime = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cashDesks.map((desk) => (
        <div key={desk.id} className="rounded-2xl border bg-white p-5">
          <div className="flex items-start gap-3">
            <div className={desk.openShiftId ? "grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700" : "grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted)]"}><Banknote className="size-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{desk.name}</h2><span className={desk.openShiftId ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800" : "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"}>{desk.openShiftId ? "Смена открыта" : "Смена закрыта"}</span></div>
              <p className="mt-1 text-xs text-[var(--muted)]">{desk.branchName}</p>
            </div>
          </div>

          {desk.openShiftId ? (
            <div className="mt-4 space-y-2 rounded-xl bg-[var(--surface-muted)] p-4 text-sm">
              <div className="flex justify-between gap-4"><span className="text-[var(--muted)]">Открыта</span><span>{desk.openedAt ? dateTime.format(new Date(desk.openedAt)) : "—"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-[var(--muted)]">Кассир</span><span>{desk.openedByName || "Не указано"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-[var(--muted)]">На начало</span><span>{money.format(desk.openingBalance ?? 0)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-[var(--muted)]">Наличными принято</span><span>{money.format(desk.cashPaymentsTotal)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-[var(--muted)]">Наличными возвращено</span><span className="text-rose-700">−{money.format(desk.cashRefundsTotal)}</span></div>
              <div className="flex justify-between gap-4 border-t pt-2 font-semibold"><span>Ожидается в кассе</span><span>{money.format(desk.expectedCashBalance ?? 0)}</span></div>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--muted)]"><CheckCircle2 className="size-4" />Нет активной смены</div>
          )}

          {canManage && desk.isActive && (desk.openShiftId
            ? <CloseShiftForm key={desk.openShiftId} shiftId={desk.openShiftId} expectedBalance={desk.expectedCashBalance ?? 0} />
            : <OpenShiftForm key={desk.id} cashDeskId={desk.id} />)}
        </div>
      ))}
    </div>
  );
}
