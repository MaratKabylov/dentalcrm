"use client";

import { useActionState, useState } from "react";
import { FileText, LoaderCircle, Pencil, Plus, Power, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { consentTypeLabels, documentTemplateVariables, documentTypeLabels } from "@/modules/documents/constants";
import { saveDocumentTemplate, setDocumentTemplateActive } from "@/modules/documents/actions";
import { CONSENT_TYPES, DOCUMENT_TYPES, type DocumentTemplate } from "@/modules/documents/types";

const textareaClassName = "min-h-36 w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm leading-6 shadow-sm placeholder:text-[#8ba099] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

function TemplateForm({ template, onCancel }: { template: DocumentTemplate | null; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(saveDocumentTemplate, initialFormState);

  return (
    <form action={formAction} className="space-y-5 rounded-2xl border bg-white p-5 lg:p-6">
      {template && <input type="hidden" name="templateId" value={template.id} />}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{template ? "Изменить шаблон" : "Новый шаблон"}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">При изменении шаблона создаётся новая версия. Уже выпущенные документы не меняются.</p>
        </div>
        {template && <button type="button" onClick={onCancel} className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]">Отмена</button>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">Название *</span>
          <Input name="name" defaultValue={template?.name ?? ""} maxLength={160} required placeholder="Например, согласие на имплантацию" />
          <FieldError errors={state.fieldErrors?.name} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Тип документа *</span>
          <select name="documentType" defaultValue={template?.documentType ?? "informed_consent"} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{documentTypeLabels[type]}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.documentType} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Регистрировать согласие</span>
          <select name="consentType" defaultValue={template?.consentType ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Нет</option>
            {CONSENT_TYPES.map((type) => <option key={type} value={type}>{consentTypeLabels[type]}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.consentType} />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">Заголовок документа *</span>
          <Input name="titleTemplate" defaultValue={template?.titleTemplate ?? ""} maxLength={240} required placeholder="Информированное согласие пациента" />
          <FieldError errors={state.fieldErrors?.titleTemplate} />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">Текст документа *</span>
          <textarea name="bodyTemplate" defaultValue={template?.bodyTemplate ?? ""} maxLength={50000} required className={`${textareaClassName} min-h-80`} placeholder="Я, {{patient_full_name}}, подтверждаю…" />
          <FieldError errors={state.fieldErrors?.bodyTemplate} />
        </label>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Доступные переменные</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {documentTemplateVariables.map((variable) => <code key={variable} className="rounded-lg bg-[var(--surface-muted)] px-2 py-1 text-[11px]">{`{{${variable}}}`}</code>)}
        </div>
      </div>

      {state.message && <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" : "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"}>{state.message}</div>}

      <div className="flex justify-end">
        <Button disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Сохранение…" : "Сохранить шаблон"}</Button>
      </div>
    </form>
  );
}

export function DocumentTemplateManager({ templates, canManage }: { templates: DocumentTemplate[]; canManage: boolean }) {
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-semibold">Шаблоны клиники</h2><p className="mt-1 text-xs text-[var(--muted)]">{templates.length} шаблонов, включая архивные.</p></div>
          {canManage && editingTemplate && <Button variant="secondary" onClick={() => setEditingTemplate(null)}><Plus className="size-4" />Новый</Button>}
        </div>
        {templates.length === 0 ? (
          <div className="rounded-2xl border bg-white p-8 text-center"><FileText className="mx-auto size-9 text-[var(--brand)]" /><p className="mt-3 font-semibold">Шаблонов пока нет</p><p className="mt-1 text-sm text-[var(--muted)]">Создайте первый шаблон документа.</p></div>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className={template.isActive ? "rounded-2xl border bg-white p-4" : "rounded-2xl border bg-[var(--surface-muted)] p-4 opacity-70"}>
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><FileText className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{template.name}</p>{!template.isActive && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold">Архив</span>}</div>
                    <p className="mt-1 text-xs text-[var(--muted)]">{documentTypeLabels[template.documentType]} · версия {template.version}</p>
                    {template.consentType && <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800">Согласие: {consentTypeLabels[template.consentType]}</span>}
                  </div>
                  {canManage && <div className="flex gap-1">
                    <button type="button" onClick={() => setEditingTemplate(template)} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={`Изменить шаблон ${template.name}`}><Pencil className="size-4" /></button>
                    <form action={setDocumentTemplateActive}>
                      <input type="hidden" name="templateId" value={template.id} /><input type="hidden" name="isActive" value={template.isActive ? "false" : "true"} />
                      <button className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={template.isActive ? `Архивировать шаблон ${template.name}` : `Восстановить шаблон ${template.name}`}><Power className="size-4" /></button>
                    </form>
                  </div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {canManage ? <TemplateForm key={editingTemplate?.id ?? "new"} template={editingTemplate} onCancel={() => setEditingTemplate(null)} /> : <div className="rounded-2xl bg-[var(--surface-muted)] p-5 text-sm leading-6 text-[var(--muted)]">Создавать и изменять шаблоны может сотрудник с правом управления документами.</div>}
    </div>
  );
}
