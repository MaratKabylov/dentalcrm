"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Plus, Stethoscope, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { addEncounterDiagnosis, removeEncounterDiagnosis } from "@/modules/diagnoses/actions";
import type { DiagnosisOption, EncounterDiagnosis } from "@/modules/diagnoses/types";
import { FDI_TOOTH_CODES } from "@/modules/odontogram/constants";

const typeLabels = {
  primary: "Основной",
  secondary: "Сопутствующий",
  differential: "Дифференциальный",
} as const;

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

export function DiagnosisPanel({
  encounterId,
  diagnoses,
  options,
  editable,
}: {
  encounterId: string;
  diagnoses: EncounterDiagnosis[];
  options: DiagnosisOption[];
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(addEncounterDiagnosis, initialFormState);
  const [selectedDiagnosisId, setSelectedDiagnosisId] = useState("");
  const creatingNew = selectedDiagnosisId === "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold">Диагнозы</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Структурированные диагнозы приёма с привязкой к зубу.</p>
      </div>

      {diagnoses.length === 0 ? (
        <div className="rounded-xl bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--muted)]">Диагнозы ещё не добавлены.</div>
      ) : (
        <div className="space-y-3">
          {diagnoses.map((diagnosis) => (
            <div key={diagnosis.encounterDiagnosisId} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Stethoscope className="size-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{diagnosis.code}</span>
                  <span className="text-sm">{diagnosis.name}</span>
                  <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold">{diagnosis.system === "icd10" ? "МКБ-10" : "Локальный"}</span>
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">{typeLabels[diagnosis.type]}</span>
                  {diagnosis.toothCode && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Зуб {diagnosis.toothCode}</span>}
                </div>
                {diagnosis.notes && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">{diagnosis.notes}</p>}
              </div>
              {editable && (
                <form action={removeEncounterDiagnosis}>
                  <input type="hidden" name="encounterId" value={encounterId} />
                  <input type="hidden" name="encounterDiagnosisId" value={diagnosis.encounterDiagnosisId} />
                  <button className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-red-50 hover:text-[var(--danger)]" aria-label={`Удалить диагноз ${diagnosis.code}`}><Trash2 className="size-4" /></button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <form action={formAction} className="space-y-5 rounded-2xl bg-[var(--surface-muted)] p-4 sm:p-5">
          <input type="hidden" name="encounterId" value={encounterId} />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium">Диагноз из справочника</span>
              <select name="diagnosisId" value={selectedDiagnosisId} onChange={(event) => setSelectedDiagnosisId(event.target.value)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm">
                <option value="">Создать новый диагноз</option>
                {options.map((option) => <option key={option.id} value={option.id}>{option.code} — {option.name} ({option.system === "icd10" ? "МКБ-10" : "локальный"})</option>)}
              </select>
            </label>

            {creatingNew && (
              <>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Система</span>
                  <select name="system" defaultValue="local" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm">
                    <option value="local">Локальный справочник</option>
                    <option value="icd10">МКБ-10</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Код *</span>
                  <Input name="code" maxLength={32} placeholder="Например, K02.1" required />
                  <FieldError errors={state.fieldErrors?.code} />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Название *</span>
                  <Input name="name" maxLength={300} placeholder="Название диагноза" required />
                  <FieldError errors={state.fieldErrors?.name} />
                </label>
              </>
            )}

            {!creatingNew && <input type="hidden" name="system" value="local" />}

            <label className="space-y-2">
              <span className="text-sm font-medium">Тип</span>
              <select name="type" defaultValue="primary" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm">
                <option value="primary">Основной</option>
                <option value="secondary">Сопутствующий</option>
                <option value="differential">Дифференциальный</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Зуб</span>
              <select name="toothCode" defaultValue="" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm">
                <option value="">Без привязки к зубу</option>
                {FDI_TOOTH_CODES.map((code) => <option key={code} value={code}>Зуб {code}</option>)}
              </select>
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium">Комментарий</span>
              <textarea name="notes" maxLength={2000} className="min-h-24 w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm" placeholder="Обоснование или уточнение диагноза" />
              <FieldError errors={state.fieldErrors?.notes} />
            </label>
          </div>

          {state.message && <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" : "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"}>{state.message}</div>}

          <div className="flex justify-end">
            <Button disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}{pending ? "Сохранение…" : "Добавить диагноз"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
