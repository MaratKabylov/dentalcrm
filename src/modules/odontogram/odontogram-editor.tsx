"use client";

import { useActionState, useMemo, useState } from "react";
import { LoaderCircle, Save, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initialFormState } from "@/modules/auth/types";
import {
  ADULT_LOWER_TEETH,
  ADULT_UPPER_TEETH,
  CHILD_LOWER_TEETH,
  CHILD_UPPER_TEETH,
  FDI_TOOTH_CODES,
  TOOTH_CONDITIONS,
  TOOTH_SURFACE_LABELS,
  TOOTH_SURFACES,
} from "@/modules/odontogram/constants";
import { saveOdontogram } from "@/modules/odontogram/actions";
import type {
  Odontogram,
  ToothCondition,
  ToothSurfaceCode,
} from "@/modules/odontogram/types";

type DraftTooth = {
  state: ToothCondition;
  notes: string;
  surfaces: Partial<Record<ToothSurfaceCode, ToothCondition>>;
};

type Dentition = "adult" | "child";

const conditionColors: Partial<Record<ToothCondition, string>> = {
  caries: "border-red-300 bg-red-50 text-red-800",
  filling: "border-sky-300 bg-sky-50 text-sky-800",
  crown: "border-amber-300 bg-amber-50 text-amber-800",
  missing: "border-slate-300 bg-slate-100 text-slate-500 line-through",
  implant: "border-violet-300 bg-violet-50 text-violet-800",
  extraction_planned: "border-orange-300 bg-orange-50 text-orange-800",
  endodontic: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800",
};

function createDraft(odontogram: Odontogram | null): Record<string, DraftTooth> {
  const previous = new Map(odontogram?.teeth.map((tooth) => [tooth.toothCode, tooth]));
  return Object.fromEntries(FDI_TOOTH_CODES.map((toothCode) => {
    const tooth = previous.get(toothCode);
    return [toothCode, {
      state: tooth?.state ?? "healthy",
      notes: tooth?.notes ?? "",
      surfaces: Object.fromEntries(tooth?.surfaces.map((surface) => [surface.surface, surface.condition]) ?? []),
    } satisfies DraftTooth];
  }));
}

function conditionLabel(condition: ToothCondition) {
  return TOOTH_CONDITIONS.find((item) => item.value === condition)?.label ?? condition;
}

function conditionClass(condition: ToothCondition) {
  if (condition === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return conditionColors[condition] ?? "border-slate-300 bg-slate-50 text-slate-800";
}

function ToothRow({
  codes,
  teeth,
  selectedCode,
  onSelect,
}: {
  codes: readonly string[];
  teeth: Record<string, DraftTooth>;
  selectedCode: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div className={codes.length > 10 ? "grid grid-cols-8 gap-1.5 sm:grid-cols-[repeat(16,minmax(0,1fr))]" : "grid grid-cols-5 gap-1.5 sm:grid-cols-[repeat(10,minmax(0,1fr))]"}>
      {codes.map((code) => {
        const tooth = teeth[code];
        const isSelected = code === selectedCode;
        return (
          <button
            type="button"
            key={code}
            onClick={() => onSelect(code)}
            className={`min-w-0 rounded-xl border px-1 py-2 text-center transition ${conditionClass(tooth.state)} ${isSelected ? "ring-2 ring-[var(--brand)] ring-offset-1" : "hover:-translate-y-0.5"}`}
            aria-pressed={isSelected}
          >
            <span className="block text-xs font-bold">{code}</span>
            <span className="mt-1 hidden truncate text-[9px] sm:block">{conditionLabel(tooth.state)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function OdontogramEditor({
  patientId,
  encounterId,
  odontogram,
  editable,
}: {
  patientId: string;
  encounterId: string | null;
  odontogram: Odontogram | null;
  editable: boolean;
}) {
  const [actionState, formAction, pending] = useActionState(saveOdontogram, initialFormState);
  const [dentition, setDentition] = useState<Dentition>("adult");
  const [selectedCode, setSelectedCode] = useState<string>("11");
  const [teeth, setTeeth] = useState<Record<string, DraftTooth>>(() => createDraft(odontogram));
  const selected = teeth[selectedCode];

  const payload = useMemo(() => FDI_TOOTH_CODES.map((toothCode) => {
    const tooth = teeth[toothCode];
    return {
      toothCode,
      state: tooth.state,
      notes: tooth.notes.trim() || null,
      surfaces: TOOTH_SURFACES.flatMap((surface) => tooth.surfaces[surface]
        ? [{ surface, condition: tooth.surfaces[surface] }]
        : []),
    };
  }), [teeth]);

  function updateSelected(update: Partial<DraftTooth>) {
    setTeeth((current) => ({
      ...current,
      [selectedCode]: { ...current[selectedCode], ...update },
    }));
  }

  function updateSurface(surface: ToothSurfaceCode, condition: string) {
    setTeeth((current) => {
      const nextSurfaces = { ...current[selectedCode].surfaces };
      if (condition === "") delete nextSurfaces[surface];
      else nextSurfaces[surface] = condition as ToothCondition;
      return {
        ...current,
        [selectedCode]: { ...current[selectedCode], surfaces: nextSurfaces },
      };
    });
  }

  const upperTeeth = dentition === "adult" ? ADULT_UPPER_TEETH : CHILD_UPPER_TEETH;
  const lowerTeeth = dentition === "adult" ? ADULT_LOWER_TEETH : CHILD_LOWER_TEETH;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="patientId" value={patientId} />
      {encounterId && <input type="hidden" name="encounterId" value={encounterId} />}
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold">Одонтограмма FDI</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{odontogram ? `Текущая версия: ${odontogram.versionNo}` : "Первая версия ещё не сохранена"}</p>
        </div>
        <div className="flex rounded-xl bg-[var(--surface-muted)] p-1">
          <button type="button" onClick={() => { setDentition("adult"); setSelectedCode("11"); }} className={dentition === "adult" ? "rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow-sm" : "px-3 py-2 text-xs text-[var(--muted)]"}>Постоянные</button>
          <button type="button" onClick={() => { setDentition("child"); setSelectedCode("51"); }} className={dentition === "child" ? "rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow-sm" : "px-3 py-2 text-xs text-[var(--muted)]"}>Молочные</button>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl bg-[var(--surface-muted)] p-3 sm:p-5">
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Верхняя челюсть</p>
        <ToothRow codes={upperTeeth} teeth={teeth} selectedCode={selectedCode} onSelect={setSelectedCode} />
        <div className="border-t border-dashed" />
        <ToothRow codes={lowerTeeth} teeth={teeth} selectedCode={selectedCode} onSelect={setSelectedCode} />
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Нижняя челюсть</p>
      </div>

      {selected && (
        <div className="rounded-2xl border p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xs text-[var(--muted)]">Выбранный зуб</p><p className="mt-1 text-xl font-semibold">{selectedCode}</p></div>
            {!editable && <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]"><ShieldCheck className="size-3.5" />Только просмотр</span>}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Состояние зуба</span>
              <select disabled={!editable} value={selected.state} onChange={(event) => updateSelected({ state: event.target.value as ToothCondition })} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm disabled:bg-[var(--surface-muted)]">
                {TOOTH_CONDITIONS.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Комментарий</span>
              <textarea disabled={!editable} value={selected.notes} onChange={(event) => updateSelected({ notes: event.target.value })} maxLength={1000} className="min-h-24 w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm disabled:bg-[var(--surface-muted)]" placeholder="Локальные наблюдения по зубу" />
            </label>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium">Поверхности</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TOOTH_SURFACES.map((surface) => (
                <label key={surface} className="space-y-1.5">
                  <span className="text-xs text-[var(--muted)]">{surface} · {TOOTH_SURFACE_LABELS[surface]}</span>
                  <select disabled={!editable} value={selected.surfaces[surface] ?? ""} onChange={(event) => updateSurface(surface, event.target.value)} className="h-10 w-full rounded-xl border bg-white px-3 text-xs disabled:bg-[var(--surface-muted)]">
                    <option value="">Без отметки</option>
                    {TOOTH_CONDITIONS.filter((condition) => condition.value !== "healthy").map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {actionState.message && (
        <div role="status" className={actionState.status === "success" ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" : "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"}>{actionState.message}</div>
      )}

      {editable && encounterId && (
        <div className="flex justify-end border-t pt-5">
          <Button disabled={pending} className="min-w-48">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            {pending ? "Сохранение…" : "Сохранить новую версию"}
          </Button>
        </div>
      )}
    </form>
  );
}
