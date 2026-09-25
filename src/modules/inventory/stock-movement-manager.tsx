"use client";

import { useActionState } from "react";
import { ArrowLeftRight, ClipboardMinus, LoaderCircle, PackagePlus, RefreshCcw, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { recordInventoryCorrection, recordInventoryOutflow, recordInventoryReceipt, transferInventoryStock } from "./actions";
import { stockMovementTypeLabels } from "./constants";
import type { InventoryItem, StockBatch, StockMovement, Warehouse } from "./types";

const selectClass = "h-11 w-full rounded-xl border bg-white px-3.5 text-sm";

function Message({ state }: { state: typeof initialFormState }) {
  return state.message ? <p role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" : "rounded-xl bg-red-50 px-3 py-2 text-xs text-[var(--danger)]"}>{state.message}</p> : null;
}

function BatchOptions({ batches }: { batches: StockBatch[] }) {
  return batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.sku} — {batch.itemName} · {batch.warehouseName} · {batch.availableQuantity} {batch.unit}{batch.expirationDate ? ` · до ${batch.expirationDate}` : ""}</option>);
}

function ReceiptForm({ warehouses, items }: { warehouses: Warehouse[]; items: InventoryItem[] }) {
  const [state, action, pending] = useActionState(recordInventoryReceipt, initialFormState);
  return <form action={action} className="space-y-3 rounded-2xl border bg-white p-5"><div className="flex items-center gap-2"><PackagePlus className="size-5 text-[var(--brand)]" /><h2 className="font-semibold">Поступление</h2></div><select name="warehouseId" required defaultValue="" className={selectClass}><option value="" disabled>Склад</option>{warehouses.filter((item) => item.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.branchName} · {warehouse.name}</option>)}</select><select name="itemId" required defaultValue="" className={selectClass}><option value="" disabled>Материал</option>{items.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.sku} — {item.name}</option>)}</select><div className="grid grid-cols-2 gap-3"><Input name="quantity" type="number" min="0.001" step="0.001" required placeholder="Количество" /><Input name="unitCost" type="number" min="0" step="0.0001" required placeholder="Цена за ед." /></div><div className="grid grid-cols-2 gap-3"><Input name="lotNumber" maxLength={120} placeholder="Номер партии" /><Input name="expirationDate" type="date" /></div><Input name="note" maxLength={1000} placeholder="Комментарий" /><Message state={state} /><Button className="w-full" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Провести поступление</Button></form>;
}

function OutflowForm({ batches }: { batches: StockBatch[] }) {
  const [state, action, pending] = useActionState(recordInventoryOutflow, initialFormState);
  return <form action={action} className="space-y-3 rounded-2xl border bg-white p-5"><div className="flex items-center gap-2"><Trash2 className="size-5 text-rose-700" /><h2 className="font-semibold">Выдача или списание</h2></div><select name="batchId" required defaultValue="" className={selectClass}><option value="" disabled>Партия</option><BatchOptions batches={batches} /></select><select name="movementType" defaultValue="issue" className={selectClass}><option value="issue">Выдача</option><option value="write_off">Списание</option></select><Input name="quantity" type="number" min="0.001" step="0.001" required placeholder="Количество" /><Input name="note" maxLength={1000} placeholder="Причина списания / комментарий" /><Message state={state} /><Button className="w-full" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <ClipboardMinus className="size-4" />}Провести расход</Button></form>;
}

function TransferForm({ batches, warehouses }: { batches: StockBatch[]; warehouses: Warehouse[] }) {
  const [state, action, pending] = useActionState(transferInventoryStock, initialFormState);
  return <form action={action} className="space-y-3 rounded-2xl border bg-white p-5"><div className="flex items-center gap-2"><ArrowLeftRight className="size-5 text-[var(--brand)]" /><h2 className="font-semibold">Перемещение</h2></div><select name="batchId" required defaultValue="" className={selectClass}><option value="" disabled>Исходная партия</option><BatchOptions batches={batches} /></select><select name="destinationWarehouseId" required defaultValue="" className={selectClass}><option value="" disabled>Склад назначения</option>{warehouses.filter((item) => item.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.branchName} · {warehouse.name}</option>)}</select><Input name="quantity" type="number" min="0.001" step="0.001" required placeholder="Количество" /><Input name="note" maxLength={1000} placeholder="Комментарий" /><Message state={state} /><Button className="w-full" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowLeftRight className="size-4" />}Переместить</Button></form>;
}

function CorrectionForm({ batches }: { batches: StockBatch[] }) {
  const [state, action, pending] = useActionState(recordInventoryCorrection, initialFormState);
  return <form action={action} className="space-y-3 rounded-2xl border bg-white p-5"><div className="flex items-center gap-2"><RefreshCcw className="size-5 text-amber-700" /><h2 className="font-semibold">Корректировка</h2></div><select name="batchId" required defaultValue="" className={selectClass}><option value="" disabled>Партия</option><BatchOptions batches={batches} /></select><Input name="quantity" type="number" step="0.001" required placeholder="Изменение: +2 или −1" /><Input name="reason" minLength={3} maxLength={1000} required placeholder="Причина инвентаризации" /><Message state={state} /><Button className="w-full" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}Провести корректировку</Button></form>;
}

export function StockMovementManager({ warehouses, items, batches, movements, canManage, currency, timeZone }: { warehouses: Warehouse[]; items: InventoryItem[]; batches: StockBatch[]; movements: StockMovement[]; canManage: boolean; currency: string; timeZone: string }) {
  const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone });
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 2 });
  return <div className="space-y-6">{canManage && <div className="grid gap-4 xl:grid-cols-4"><ReceiptForm warehouses={warehouses} items={items} /><OutflowForm batches={batches} /><TransferForm batches={batches} warehouses={warehouses} /><CorrectionForm batches={batches} /></div>}<div className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-5"><h2 className="font-semibold">Журнал движений</h2><p className="mt-1 text-xs text-[var(--muted)]">Неизменяемый источник складских остатков.</p></div>{movements.length === 0 ? <p className="p-8 text-center text-sm text-[var(--muted)]">Движений пока нет.</p> : <div className="divide-y">{movements.map((movement) => <div key={movement.id} className="grid gap-2 p-4 sm:grid-cols-[0.75fr_1fr_0.5fr_0.8fr]"><div><span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-semibold">{stockMovementTypeLabels[movement.movementType]}</span><p className="mt-2 text-xs text-[var(--muted)]">{dateTime.format(new Date(movement.createdAt))}</p></div><div><p className="text-sm font-semibold">{movement.sku} — {movement.itemName}</p><p className="mt-1 text-xs text-[var(--muted)]">{movement.warehouseName}{movement.lotNumber ? ` · партия ${movement.lotNumber}` : ""}</p></div><p className={movement.quantity > 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{movement.quantity > 0 ? "+" : ""}{movement.quantity} {movement.unit}</p><div className="text-xs text-[var(--muted)]"><p>{movement.unitCost !== null ? money.format(movement.unitCost) : "Без стоимости"}</p><p className="mt-1">{movement.createdByName}</p>{movement.note && <p className="mt-1 text-[var(--foreground)]">{movement.note}</p>}</div></div>)}</div>}</div></div>;
}
