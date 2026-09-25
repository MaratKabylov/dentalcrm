"use client";

import { useActionState } from "react";
import { Calculator, CalendarX2, LoaderCircle, Plus, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { closeCompensationRule, postCompensationEntries, saveCompensationRule } from "./actions";
import type { CompensationReferenceData, CompensationRule } from "./types";

const ruleLabels = { percent_revenue: "% от выручки", fixed_per_service: "Фикс за услугу", percent_margin: "% от маржи" } as const;

function Message({ state }: { state: typeof initialFormState }) {
  if (!state.message) return null;
  return <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" : "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"}>{state.message}</div>;
}

export function PayrollManager({ references, rules, from, to, canManage }: { references: CompensationReferenceData; rules: CompensationRule[]; from: string; to: string; canManage: boolean }) {
  const [ruleState, ruleAction, rulePending] = useActionState(saveCompensationRule, initialFormState);
  const [postState, postAction, postPending] = useActionState(postCompensationEntries, initialFormState);
  return <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
    <div className="space-y-5">
      {canManage && <form action={ruleAction} className="space-y-4 rounded-2xl border bg-white p-5"><div><h2 className="font-semibold">Новое правило</h2><p className="mt-1 text-xs text-[var(--muted)]">Пустая область создаёт базовую ставку для всех врачей и услуг.</p></div>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Врач</span><select name="employeeId" className="h-11 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Все врачи</option>{references.doctors.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Категория услуг</span><select name="categoryId" className="h-11 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Все категории</option>{references.categories.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Конкретная услуга</span><select name="serviceId" className="h-11 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Все услуги</option>{references.services.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} — ` : ""}{item.name}</option>)}</select><span className="text-[11px] text-[var(--muted)]">Одновременно категорию и услугу выбирать нельзя.</span></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5"><span className="text-sm font-medium">Метод</span><select name="ruleType" className="h-11 w-full rounded-xl border bg-white px-3 text-sm">{Object.entries(ruleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="space-y-1.5"><span className="text-sm font-medium">Ставка</span><Input name="value" type="number" min="0" step="0.01" required /></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5"><span className="text-sm font-medium">Действует с</span><Input name="validFrom" type="date" defaultValue={from} required /></label><label className="space-y-1.5"><span className="text-sm font-medium">Действует по</span><Input name="validTo" type="date" /></label></div><Message state={ruleState} /><Button disabled={rulePending} className="w-full">{rulePending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}{rulePending ? "Сохранение…" : "Добавить ставку"}</Button>
      </form>}
      <form action={postAction} className="space-y-4 rounded-2xl border bg-[#123d35] p-5 text-white"><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-emerald-200" /><div><h2 className="font-semibold">Зафиксировать начисления</h2><p className="mt-1 text-xs leading-5 text-emerald-50/70">Создаёт неизменяемые снимки ставок по выставленным услугам за {from} — {to}. Повторный запуск не дублирует начисления.</p></div></div><Message state={postState} />{canManage ? <Button disabled={postPending} className="w-full bg-white text-[#123d35] hover:bg-emerald-50">{postPending ? <LoaderCircle className="size-4 animate-spin" /> : <Calculator className="size-4" />}{postPending ? "Расчёт…" : "Рассчитать и зафиксировать"}</Button> : <p className="text-xs text-emerald-50/70">Доступен только просмотр уже зафиксированных начислений.</p>}</form>
    </div>
    <div className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-5"><h2 className="font-semibold">Версии ставок</h2><p className="mt-1 text-xs text-[var(--muted)]">История не редактируется: текущая ставка завершается, новая создаётся отдельной записью.</p></div>{rules.length === 0 ? <p className="p-8 text-center text-sm text-[var(--muted)]">Правила начислений ещё не настроены.</p> : <div className="divide-y">{rules.map((rule) => <div key={rule.id} className="p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><span className={rule.isActive ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800" : "rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600"}>{rule.isActive ? "Действует" : "Завершено"}</span><strong>{ruleLabels[rule.ruleType]} · {rule.value.toLocaleString("ru-RU")}{rule.ruleType === "fixed_per_service" ? "" : "%"}</strong></div><p className="mt-2 text-sm">{[rule.employeeName ?? "Все врачи", rule.serviceName ?? rule.categoryName ?? "Все услуги"].join(" · ")}</p><p className="mt-1 text-xs text-[var(--muted)]">{rule.validFrom} — {rule.validTo ?? "без окончания"}</p></div>{canManage && rule.isActive && <form action={closeCompensationRule} className="flex items-end gap-2"><input type="hidden" name="ruleId" value={rule.id} /><label className="space-y-1"><span className="text-[10px] text-[var(--muted)]">Последний день</span><Input name="closingDate" type="date" min={rule.validFrom} defaultValue={to} className="w-36" required /></label><Button variant="secondary" aria-label="Завершить ставку"><CalendarX2 className="size-4" /></Button></form>}</div></div>)}</div>}</div>
  </div>;
}
