"use client";

import { useActionState, useState } from "react";
import { Boxes, LoaderCircle, Pencil, Plus, Power, Save, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { saveInventoryCategory, saveInventoryItem, setInventoryItemActive } from "./actions";
import type { InventoryCategory, InventoryItem } from "./types";

function Message({ state }: { state: typeof initialFormState }) {
  return state.message ? <p role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" : "rounded-xl bg-red-50 px-3 py-2 text-xs text-[var(--danger)]"}>{state.message}</p> : null;
}

function CategoryForm() {
  const [state, action, pending] = useActionState(saveInventoryCategory, initialFormState);
  return <form action={action} className="mt-4 space-y-3 border-t pt-4"><label className="block space-y-2"><span className="text-xs font-semibold">Новая категория</span><Input name="name" minLength={2} maxLength={160} required placeholder="Например, эндодонтия" /></label><Message state={state} /><Button className="w-full" variant="secondary" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Добавить категорию</Button></form>;
}

function ItemForm({ item, categories, onCancel }: { item: InventoryItem | null; categories: InventoryCategory[]; onCancel: () => void }) {
  const [state, action, pending] = useActionState(saveInventoryItem, initialFormState);
  return <form action={action} className="space-y-4 rounded-2xl border bg-white p-5">{item && <input type="hidden" name="itemId" value={item.id} />}<div className="flex items-center justify-between"><div><h2 className="font-semibold">{item ? "Изменить материал" : "Новый материал"}</h2><p className="mt-1 text-xs text-[var(--muted)]">Карточка складской номенклатуры.</p></div>{item && <button type="button" onClick={onCancel} className="text-xs text-[var(--muted)]">Отмена</button>}</div><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2"><span className="text-sm font-medium">Категория *</span><select name="categoryId" defaultValue={item?.categoryId ?? ""} required className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm"><option value="" disabled>Выберите категорию</option>{categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="space-y-2"><span className="text-sm font-medium">Артикул *</span><Input name="sku" defaultValue={item?.sku ?? ""} maxLength={60} required placeholder="MAT-001" /></label><label className="space-y-2 sm:col-span-2"><span className="text-sm font-medium">Название *</span><Input name="name" defaultValue={item?.name ?? ""} maxLength={240} required /></label><label className="space-y-2"><span className="text-sm font-medium">Единица *</span><Input name="unit" defaultValue={item?.unit ?? "шт."} maxLength={40} required placeholder="шт., мл, уп." /></label><label className="space-y-2"><span className="text-sm font-medium">Минимальный остаток</span><Input name="minStock" type="number" min="0" step="0.001" defaultValue={item?.minStock ?? 0} required /></label></div><Message state={state} /><Button className="w-full" disabled={pending || categories.length === 0}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Сохранение…" : "Сохранить материал"}</Button></form>;
}

export function InventoryItemsManager({ categories, items, canManage }: { categories: InventoryCategory[]; items: InventoryItem[]; canManage: boolean }) {
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  return <div className="grid gap-6 xl:grid-cols-[0.42fr_1fr]">
    <div className="space-y-5"><div className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2"><Tags className="size-5 text-[var(--brand)]" /><h2 className="font-semibold">Категории</h2></div><div className="mt-4 space-y-2">{categories.map((category) => <div key={category.id} className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm font-medium">{category.name}</div>)}</div>{canManage && <CategoryForm />}</div>{canManage && <ItemForm key={editing?.id ?? "new"} item={editing} categories={categories} onCancel={() => setEditing(null)} />}</div>
    <div className="rounded-2xl border bg-white"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-semibold">Материалы</h2><p className="mt-1 text-xs text-[var(--muted)]">{items.length} позиций в номенклатуре.</p></div><Boxes className="size-5 text-[var(--brand)]" /></div><div className="divide-y">{items.length === 0 ? <p className="p-8 text-center text-sm text-[var(--muted)]">Материалы ещё не добавлены.</p> : items.map((item) => { const category = categories.find((value) => value.id === item.categoryId); return <div key={item.id} className={item.isActive ? "flex items-start gap-3 p-4" : "flex items-start gap-3 bg-[var(--surface-muted)] p-4 opacity-70"}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold">{item.sku}</span><p className="font-semibold">{item.name}</p>{!item.isActive && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold">Архив</span>}</div><p className="mt-1 text-xs text-[var(--muted)]">{category?.name ?? "Без категории"} · {item.unit} · минимум {item.minStock}</p></div>{canManage && <div className="flex gap-1"><button type="button" onClick={() => setEditing(item)} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]"><Pencil className="size-4" /></button><form action={setInventoryItemActive}><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="isActive" value={item.isActive ? "false" : "true"} /><button className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]"><Power className="size-4" /></button></form></div>}</div>; })}</div></div>
  </div>;
}
