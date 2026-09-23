"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckCircle2, LoaderCircle, Save, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initialFormState } from "@/modules/auth/types";
import { applyClinicalTemplate } from "@/modules/clinical-templates/apply-template";
import type { ClinicalTemplate } from "@/modules/clinical-templates/types";
import { saveClinicalEncounter } from "@/modules/clinical/actions";
import type { ClinicalEncounter } from "@/modules/clinical/types";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

const textareaClassName = "min-h-28 w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm placeholder:text-[#8ba099] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]";

export function EncounterForm({
  encounter,
  templates,
}: {
  encounter: ClinicalEncounter;
  templates: ClinicalTemplate[];
}) {
  const [state, formAction, pending] = useActionState(saveClinicalEncounter, initialFormState);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [fields, setFields] = useState({
    chiefComplaint: encounter.chiefComplaint ?? "",
    anamnesis: encounter.anamnesis ?? "",
    diagnosisSummary: encounter.diagnosisSummary ?? "",
    clinicalNotes: encounter.clinicalNotes ?? "",
  });

  function applyTemplate() {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) return;
    const result = applyClinicalTemplate(fields, template);
    if (!result.success) {
      setTemplateMessage("Шаблон не применён: одно из полей превысит допустимую длину.");
      return;
    }
    setFields(result.fields);
    setTemplateMessage(`Шаблон «${template.name}» добавлен к текущему тексту.`);
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="encounterId" value={encounter.id} />

      <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-2">
            <span className="text-sm font-semibold">Клинический шаблон</span>
            <select
              value={selectedTemplateId}
              onChange={(event) => {
                setSelectedTemplateId(event.target.value);
                setTemplateMessage(null);
              }}
              className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm"
              disabled={templates.length === 0}
            >
              {templates.length === 0 ? (
                <option value="">Активных шаблонов пока нет</option>
              ) : templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={applyTemplate} disabled={!selectedTemplateId}>
            <WandSparkles className="size-4" />Добавить в поля
          </Button>
          <Link href="/clinical/templates" className="pb-2 text-center text-xs font-medium text-[var(--brand)] hover:underline sm:px-2">Открыть справочник</Link>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">Шаблон дополняет заполненные поля и не заменяет существующий текст.</p>
        {templateMessage && <p role="status" className="mt-2 text-xs font-medium text-[var(--brand-dark)]">{templateMessage}</p>}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold">Жалобы пациента</span>
          <textarea className={textareaClassName} name="chiefComplaint" value={fields.chiefComplaint} onChange={(event) => setFields((current) => ({ ...current, chiefComplaint: event.target.value }))} maxLength={4000} placeholder="Основные жалобы и причина обращения" />
          <FieldError errors={state.fieldErrors?.chiefComplaint} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Анамнез</span>
          <textarea className={textareaClassName} name="anamnesis" value={fields.anamnesis} onChange={(event) => setFields((current) => ({ ...current, anamnesis: event.target.value }))} maxLength={8000} placeholder="История состояния, аллергии и важные факторы" />
          <FieldError errors={state.fieldErrors?.anamnesis} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Диагностическое заключение</span>
          <textarea className={textareaClassName} name="diagnosisSummary" value={fields.diagnosisSummary} onChange={(event) => setFields((current) => ({ ...current, diagnosisSummary: event.target.value }))} maxLength={4000} placeholder="Клиническая сводка; структурированные диагнозы добавляются ниже" />
          <FieldError errors={state.fieldErrors?.diagnosisSummary} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Клинические заметки</span>
          <textarea className={textareaClassName} name="clinicalNotes" value={fields.clinicalNotes} onChange={(event) => setFields((current) => ({ ...current, clinicalNotes: event.target.value }))} maxLength={12000} placeholder="Осмотр, выполненные действия и рекомендации" />
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
