"use client";

import { useActionState } from "react";
import { CheckCircle2, LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initialFormState } from "@/modules/auth/types";
import { saveClinicalEncounter } from "@/modules/clinical/actions";
import type { ClinicalEncounter } from "@/modules/clinical/types";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

const textareaClassName = "min-h-28 w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm placeholder:text-[#8ba099] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]";

export function EncounterForm({ encounter }: { encounter: ClinicalEncounter }) {
  const [state, formAction, pending] = useActionState(saveClinicalEncounter, initialFormState);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="encounterId" value={encounter.id} />
      <div className="grid gap-5 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold">Жалобы пациента</span>
          <textarea className={textareaClassName} name="chiefComplaint" defaultValue={encounter.chiefComplaint ?? ""} maxLength={4000} placeholder="Основные жалобы и причина обращения" />
          <FieldError errors={state.fieldErrors?.chiefComplaint} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Анамнез</span>
          <textarea className={textareaClassName} name="anamnesis" defaultValue={encounter.anamnesis ?? ""} maxLength={8000} placeholder="История состояния, аллергии и важные факторы" />
          <FieldError errors={state.fieldErrors?.anamnesis} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Диагностическое заключение</span>
          <textarea className={textareaClassName} name="diagnosisSummary" defaultValue={encounter.diagnosisSummary ?? ""} maxLength={4000} placeholder="Предварительный или подтверждённый диагноз" />
          <FieldError errors={state.fieldErrors?.diagnosisSummary} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Клинические заметки</span>
          <textarea className={textareaClassName} name="clinicalNotes" defaultValue={encounter.clinicalNotes ?? ""} maxLength={12000} placeholder="Осмотр, выполненные действия и рекомендации" />
          <FieldError errors={state.fieldErrors?.clinicalNotes} />
        </label>
      </div>

      {state.message && (
        <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" : "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"}>
          {state.message}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
        <Button type="submit" name="intent" value="save" variant="secondary" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          Сохранить черновик
        </Button>
        <Button type="submit" name="intent" value="close" disabled={pending}>
          <CheckCircle2 className="size-4" />Завершить приём
        </Button>
      </div>
    </form>
  );
}
