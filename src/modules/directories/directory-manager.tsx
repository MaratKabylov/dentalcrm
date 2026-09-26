"use client";

import { useActionState, useMemo, useState } from "react";
import { Archive, BookOpen, LoaderCircle, Pencil, Plus, RotateCcw, Save, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { saveDirectoryEntry, setDirectoryEntryActive } from "./actions";
import type { DirectoryEntry, DirectoryKind, DirectoryManagementData } from "./types";

const labels: Record<DirectoryKind, string> = {
  service_category: "Категории услуг", specialization: "Специализации", employee_position: "Должности",
  room: "Кабинеты", patient_source: "Источники пациентов",
  appointment_cancellation_reason: "Причины отмены", payment_method: "Способы оплаты",
  expense_category: "Категории расходов", appointment_status: "Статусы записи", patient_tag: "Теги пациентов",
};
const noCreate = new Set<DirectoryKind>(["payment_method", "appointment_status"]);
const colorKinds = new Set<DirectoryKind>(["patient_source", "appointment_cancellation_reason", "expense_category", "appointment_status", "patient_tag"]);
const codeKinds = new Set<DirectoryKind>(["employee_position", "patient_source", "appointment_cancellation_reason", "payment_method", "expense_category", "appointment_status"]);
const fixedGlobal = new Set<DirectoryKind>(["service_category", "specialization", "patient_source", "payment_method", "appointment_status"]);

function StatusButton({ entry }: { entry: DirectoryEntry }) {
  const [state, action, pending] = useActionState(setDirectoryEntryActive, initialFormState);
  if (entry.isSystem) return <span title="Системный код защищён" className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"><ShieldCheck className="size-3.5" />Системное</span>;
  return <div><form action={action}><input type="hidden" name="entryId" value={entry.id} /><input type="hidden" name="kind" value={entry.kind} /><input type="hidden" name="scope" value={entry.scope} />{entry.branchId && <input type="hidden" name="branchId" value={entry.branchId} />}<input type="hidden" name="isActive" value={entry.isActive ? "false" : "true"} /><Button variant="ghost" disabled={pending} className={entry.isActive ? "px-2 text-[var(--danger)]" : "px-2 text-emerald-700"}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : entry.isActive ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}{entry.isActive ? "В архив" : "Восстановить"}</Button></form>{state.message && <p className="mt-1 text-xs text-[var(--danger)]">{state.message}</p>}</div>;
}

function EntryForm({ entry, kind, data, onCancel }: { entry: DirectoryEntry | null; kind: DirectoryKind; data: DirectoryManagementData; onCancel: () => void }) {
  const [state, action, pending] = useActionState(saveDirectoryEntry, initialFormState);
  const initialScope = entry?.scope ?? (kind === "room" || !data.canManageGlobal ? "branch" : "organization");
  const [scope, setScope] = useState<"organization" | "branch">(initialScope);
  const scopeLocked = Boolean(entry) || fixedGlobal.has(kind) || kind === "room";
  return <Card className="p-5"><form action={action} className="space-y-4">{entry && <input type="hidden" name="entryId" value={entry.id} />}<input type="hidden" name="kind" value={kind} />{scopeLocked && <input type="hidden" name="scope" value={scope} />}{entry?.branchId && <input type="hidden" name="branchId" value={entry.branchId} />}{!codeKinds.has(kind) && <input type="hidden" name="code" value={entry?.code ?? `${kind}_entry`} />}<div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{entry ? "Изменить значение" : `Новое: ${labels[kind].toLowerCase()}`}</h2><button type="button" onClick={onCancel} className="text-xs text-[var(--muted)]">Отмена</button></div><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2"><span className="text-sm font-medium">Название *</span><Input name="name" defaultValue={entry?.name ?? ""} required maxLength={160} /></label>{codeKinds.has(kind) && <label className="space-y-2"><span className="text-sm font-medium">Код *</span><Input name="code" defaultValue={entry?.code ?? ""} readOnly={entry?.isSystem} pattern="[a-z0-9_]{2,60}" required /></label>}<label className="space-y-2"><span className="text-sm font-medium">Область</span><select name={scopeLocked ? undefined : "scope"} value={scope} disabled={scopeLocked} onChange={(event) => setScope(event.target.value as "organization" | "branch")} className="h-11 w-full rounded-xl border bg-white px-3 text-sm disabled:bg-slate-100"><option value="organization">Вся сеть</option><option value="branch">Филиал</option></select></label><label className="space-y-2"><span className="text-sm font-medium">Филиал</span><select name={entry ? undefined : "branchId"} defaultValue={entry?.branchId ?? ""} disabled={scope !== "branch" || Boolean(entry)} className="h-11 w-full rounded-xl border bg-white px-3 text-sm disabled:bg-slate-100"><option value="">Выберите филиал</option>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>{colorKinds.has(kind) && <label className="space-y-2"><span className="text-sm font-medium">Цвет</span><Input name="color" type="color" defaultValue={entry?.color ?? "#64748B"} className="p-1.5" /></label>}{!colorKinds.has(kind) && <input type="hidden" name="color" value="" />}<label className="space-y-2"><span className="text-sm font-medium">Порядок</span><Input name="sortOrder" type="number" min={0} max={10000} defaultValue={entry?.sortOrder ?? 100} required /></label></div>{state.message && <p className={state.status === "error" ? "text-sm text-[var(--danger)]" : "text-sm text-emerald-700"}>{state.message}</p>}<div className="flex justify-end"><Button disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Сохранить</Button></div></form></Card>;
}

export function DirectoryManager({ data }: { data: DirectoryManagementData }) {
  const visibleKinds = useMemo(() => Object.keys(labels) as DirectoryKind[], []);
  const [kind, setKind] = useState<DirectoryKind>(visibleKinds[0]);
  const [editing, setEditing] = useState<DirectoryEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const entries = data.entries.filter((entry) => entry.kind === kind);
  const canCreate = !noCreate.has(kind) && (
    kind === "room"
      ? data.canManageBranch
      : fixedGlobal.has(kind)
        ? data.canManageGlobal
        : data.canManageGlobal || data.canManageBranch
  );

  function chooseKind(value: DirectoryKind) { setKind(value); setEditing(null); setCreating(false); }
  return <div className="grid gap-6 lg:grid-cols-[260px_1fr]"><Card className="h-fit p-2">{visibleKinds.map((item) => <button key={item} onClick={() => chooseKind(item)} className={kind === item ? "flex w-full items-center gap-2 rounded-xl bg-[var(--brand-soft)] px-3 py-2.5 text-left text-sm font-semibold text-[var(--brand-dark)]" : "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--muted)] hover:bg-[var(--surface-muted)]"}><BookOpen className="size-4" />{labels[item]}</button>)}</Card><div className="space-y-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{labels[kind]}</h2><p className="mt-1 text-sm text-[var(--muted)]">Используемые значения архивируются и остаются в истории.</p></div>{canCreate && !creating && !editing && <Button onClick={() => setCreating(true)}><Plus className="size-4" />Добавить</Button>}</div>{(creating || editing) && <EntryForm key={editing?.id ?? `new-${kind}`} entry={editing} kind={kind} data={data} onCancel={() => { setEditing(null); setCreating(false); }} />}<Card className="divide-y">{entries.length === 0 ? <p className="p-8 text-center text-sm text-[var(--muted)]">Значений пока нет.</p> : entries.map((entry) => { const canManageEntry = entry.scope === "organization" ? data.canManageGlobal : data.canManageBranch; return <div key={entry.id} className={entry.isActive ? "flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center" : "flex flex-col justify-between gap-3 bg-[var(--surface-muted)] p-4 opacity-70 sm:flex-row sm:items-center"}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{entry.color && <span className="size-3 rounded-full" style={{ backgroundColor: entry.color }} />}<p className="font-semibold">{entry.name}</p><span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold">{entry.code}</span>{!entry.isActive && <span className="text-xs text-[var(--muted)]">Архив</span>}</div><p className="mt-1 text-xs text-[var(--muted)]">{entry.scope === "organization" ? "Вся сеть" : entry.branchName} · используется: {entry.usageCount}</p></div><div className="flex items-center gap-1">{canManageEntry && <button onClick={() => { setEditing(entry); setCreating(false); }} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={`Изменить ${entry.name}`}><Pencil className="size-4" /></button>}{canManageEntry ? <StatusButton entry={entry} /> : entry.isSystem ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"><ShieldCheck className="size-3.5" />Системное</span> : null}</div></div>; })}</Card></div></div>;
}
