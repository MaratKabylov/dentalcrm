"use client";

import { useActionState } from "react";
import { LoaderCircle, PackageCheck, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { writeOffProcedureMaterial } from "./actions";
import type { PendingProcedureMaterialUsage, StockBatch } from "./types";

function UsageForm({ usage, batches }: { usage: PendingProcedureMaterialUsage; batches: StockBatch[] }) {
  const [state, action, pending] = useActionState(writeOffProcedureMaterial, initialFormState);
  const eligible = batches.filter((batch) => batch.itemId === usage.itemId && batch.availableQuantity > 0);
  return <form action={action} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_0.32fr_auto] sm:items-end"><input type="hidden" name="performedServiceId" value={usage.performedServiceId} /><input type="hidden" name="normId" value={usage.normId} /><label className="space-y-2"><span className="text-xs font-semibold">Партия</span><select name="batchId" required defaultValue="" className="h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="" disabled>Выберите по FEFO</option>{eligible.map((batch) => <option key={batch.id} value={batch.id}>{batch.warehouseName} · {batch.lotNumber ?? "без номера"} · {batch.availableQuantity} {batch.unit}{batch.expirationDate ? ` · до ${batch.expirationDate}` : ""}</option>)}</select></label><label className="space-y-2"><span className="text-xs font-semibold">Количество</span><Input className="h-10" name="quantity" type="number" min="0.001" max={usage.remainingQuantity} step="0.001" defaultValue={usage.remainingQuantity} required /></label><Button className="h-10" disabled={pending || eligible.length === 0}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}Списать</Button>{state.message && <p role="status" className={state.status === "success" ? "text-xs text-emerald-700 sm:col-span-3" : "text-xs text-[var(--danger)] sm:col-span-3"}>{state.message}</p>}</form>;
}

export function ProcedureUsagePanel({ usages, batches, canManage, timeZone }: { usages: PendingProcedureMaterialUsage[]; batches: StockBatch[]; canManage: boolean; timeZone: string }) {
  const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone });
  return <div className="space-y-4">{usages.length === 0 ? <div className="rounded-2xl border bg-white p-10 text-center"><PackageCheck className="mx-auto size-10 text-emerald-600" /><h2 className="mt-3 font-semibold">Все материалы учтены</h2><p className="mt-1 text-sm text-[var(--muted)]">Нет выполненных процедур с незавершённым списанием по нормам.</p></div> : usages.map((usage) => <article key={`${usage.performedServiceId}:${usage.normId}`} className="rounded-2xl border bg-white p-5"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Stethoscope className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{usage.serviceName}</h2><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Ожидает списания</span></div><p className="mt-1 text-xs text-[var(--muted)]">{usage.patientName} · {dateTime.format(new Date(usage.performedAt))}</p><p className="mt-3 text-sm">{usage.itemSku} — {usage.itemName}: <strong>{usage.remainingQuantity} {usage.unit}</strong> осталось из {usage.suggestedQuantity} {usage.unit}</p></div></div>{canManage && <UsageForm usage={usage} batches={batches} />}</article>)}</div>;
}
