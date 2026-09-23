"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Pencil, Plus, Power, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { savePatientSource, setPatientSourceActive } from "@/modules/crm/actions";
import type { PatientSource } from "@/modules/crm/types";

function SourceForm({ source, onCancel }: { source: PatientSource | null; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(savePatientSource, initialFormState);
  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-[var(--surface-muted)] p-4">
      {source && <input type="hidden" name="sourceId" value={source.id} />}
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{source ? "Изменить источник" : "Новый источник"}</h3>{source && <button type="button" onClick={onCancel} className="text-xs font-medium text-[var(--muted)]">Отмена</button>}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2"><span className="text-xs font-medium">Название</span><Input name="name" defaultValue={source?.name ?? ""} maxLength={120} required />{state.fieldErrors?.name?.[0] && <span className="text-xs text-[var(--danger)]">{state.fieldErrors.name[0]}</span>}</label>
        <label className="space-y-2"><span className="text-xs font-medium">Системный код</span><Input name="code" defaultValue={source?.code ?? ""} placeholder="telegram_ads" maxLength={40} required />{state.fieldErrors?.code?.[0] && <span className="text-xs text-[var(--danger)]">{state.fieldErrors.code[0]}</span>}</label>
        <label className="space-y-2"><span className="text-xs font-medium">Цвет</span><Input name="color" type="color" defaultValue={source?.color ?? "#087F6D"} required /></label>
        <label className="space-y-2"><span className="text-xs font-medium">Порядок</span><Input name="sortOrder" type="number" min="0" max="10000" defaultValue={source?.sortOrder ?? 100} required /></label>
      </div>
      {state.message && <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" : "rounded-xl bg-red-50 px-3 py-2 text-xs text-[var(--danger)]"}>{state.message}</div>}
      <Button disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Сохранение…" : "Сохранить"}</Button>
    </form>
  );
}

function SourceActivityButton({ source }: { source: PatientSource }) {
  const [state, formAction, pending] = useActionState(setPatientSourceActive, initialFormState);
  return (
    <form action={formAction}>
      <input type="hidden" name="sourceId" value={source.id} />
      <input type="hidden" name="isActive" value={String(!source.isActive)} />
      <button title={state.message} disabled={pending || source.code === "unknown"} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)] disabled:opacity-40"><Power className="size-4" /></button>
    </form>
  );
}

export function SourceManager({ sources }: { sources: PatientSource[] }) {
  const [editing, setEditing] = useState<PatientSource | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="grid grid-cols-[32px_1fr_120px_90px] gap-3 border-b bg-[var(--surface-muted)] px-5 py-3 text-xs font-semibold text-[var(--muted)]"><span /><span>Источник</span><span>Код</span><span>Действия</span></div>
        <div className="divide-y">
          {sources.map((source) => (
            <div key={source.id} className={source.isActive ? "grid grid-cols-[32px_1fr_120px_90px] items-center gap-3 px-5 py-4" : "grid grid-cols-[32px_1fr_120px_90px] items-center gap-3 px-5 py-4 opacity-50"}>
              <span className="size-3 rounded-full" style={{ backgroundColor: source.color }} />
              <div><p className="text-sm font-semibold">{source.name}</p><p className="text-xs text-[var(--muted)]">{source.isActive ? "Активен" : "Отключён"}</p></div>
              <code className="text-xs text-[var(--muted)]">{source.code}</code>
              <div className="flex"><button onClick={() => { setEditing(source); setCreating(false); }} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]"><Pencil className="size-4" /></button><SourceActivityButton source={source} /></div>
            </div>
          ))}
        </div>
      </div>
      <div>
        {!creating && !editing ? <Button onClick={() => setCreating(true)} className="w-full"><Plus className="size-4" />Добавить источник</Button> : <SourceForm key={editing?.id ?? "new"} source={editing} onCancel={() => { setEditing(null); setCreating(false); }} />}
      </div>
    </div>
  );
}
