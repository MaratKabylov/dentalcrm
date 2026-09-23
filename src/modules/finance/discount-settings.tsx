"use client";

import { useActionState } from "react";
import { BadgePercent, LoaderCircle, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState, type FormActionState } from "@/modules/auth/types";
import {
  createDiscountDefinition,
  setDiscountDefinitionActive,
  setDiscountRoleLimit,
} from "@/modules/finance/actions";
import type { DiscountDefinition, DiscountRoleLimit } from "@/modules/finance/types";

function Message({ state }: { state: FormActionState }) {
  if (!state.message) return null;
  return <p role="status" className={state.status === "success" ? "text-xs text-emerald-700" : "text-xs text-[var(--danger)]"}>{state.message}</p>;
}

function DiscountStatusForm({ discount }: { discount: DiscountDefinition }) {
  const [state, formAction, pending] = useActionState(setDiscountDefinitionActive, initialFormState);
  return (
    <form action={formAction} className="flex flex-col items-start gap-2 sm:items-end">
      <input type="hidden" name="discountId" value={discount.id} />
      <input type="hidden" name="isActive" value={String(!discount.isActive)} />
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Power className="size-4" />}{discount.isActive ? "Отключить" : "Включить"}</Button>
      <Message state={state} />
    </form>
  );
}

function RoleLimitForm({ role }: { role: DiscountRoleLimit }) {
  const [state, formAction, pending] = useActionState(setDiscountRoleLimit, initialFormState);
  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="roleId" value={role.roleId} />
      <label className="space-y-1.5"><span className="text-xs text-[var(--muted)]">Максимум, %</span><Input className="w-36" name="maxDiscountPercent" type="number" min="0" max="100" step="0.01" defaultValue={role.maxDiscountPercent} required /></label>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : "Сохранить"}</Button>
      <Message state={state} />
    </form>
  );
}

export function DiscountSettings({
  discounts,
  roleLimits,
  currency,
  canConfigure,
}: {
  discounts: DiscountDefinition[];
  roleLimits: DiscountRoleLimit[];
  currency: string;
  canConfigure: boolean;
}) {
  const [createState, createAction, createPending] = useActionState(createDiscountDefinition, initialFormState);
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {canConfigure && (
        <form action={createAction} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div><h2 className="font-semibold">Новая скидка</h2><p className="mt-1 text-xs text-[var(--muted)]">Название и значение сохраняются снимком при каждом применении.</p></div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2"><span className="text-sm font-medium">Название *</span><Input name="name" minLength={2} maxLength={120} required placeholder="Например: Семейная" /></label>
            <label className="space-y-2"><span className="text-sm font-medium">Тип *</span><select name="type" defaultValue="percentage" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm"><option value="percentage">Процент</option><option value="fixed">Фиксированная сумма</option></select></label>
            <label className="space-y-2"><span className="text-sm font-medium">Значение *</span><Input name="value" type="number" min="0.01" step="0.01" required /></label>
          </div>
          {createState.message && <div role="status" className={createState.status === "success" ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" : "rounded-xl bg-red-50 px-3 py-2 text-xs text-[var(--danger)]"}>{createState.message}</div>}
          <div className="flex justify-end"><Button disabled={createPending}>{createPending ? <LoaderCircle className="size-4 animate-spin" /> : <BadgePercent className="size-4" />}{createPending ? "Создание…" : "Добавить скидку"}</Button></div>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5"><h2 className="font-semibold">Справочник скидок</h2></div>
        <div className="divide-y">
          {discounts.map((discount) => (
            <div key={discount.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{discount.name}</p><span className={discount.isActive ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800" : "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"}>{discount.isActive ? "Активна" : "Отключена"}</span></div><p className="mt-1 text-sm text-[var(--muted)]">{discount.type === "percentage" ? `${discount.value}% от подытога счёта` : money.format(discount.value)}</p></div>
              {canConfigure && <DiscountStatusForm discount={discount} />}
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5"><h2 className="font-semibold">Лимиты по ролям</h2><p className="mt-1 text-xs text-[var(--muted)]">Если у сотрудника несколько ролей, действует наибольший разрешённый процент.</p></div>
        <div className="divide-y">
          {roleLimits.map((role) => (
            <div key={role.roleId} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold">{role.roleName}</p><p className="mt-1 text-xs text-[var(--muted)]">{role.roleCode} · текущий лимит {role.maxDiscountPercent}%</p></div>{canConfigure ? <RoleLimitForm role={role} /> : <span className="text-sm font-semibold">{role.maxDiscountPercent}%</span>}</div>
          ))}
        </div>
      </section>
    </div>
  );
}
