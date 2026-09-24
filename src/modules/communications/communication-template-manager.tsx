"use client";

import { useActionState, useState } from "react";
import { FileText, LoaderCircle, Pencil, Plus, Power, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import {
  saveCommunicationTemplate,
  setCommunicationTemplateActive,
} from "@/modules/communications/actions";
import {
  communicationChannelLabels,
  communicationChannelOptions,
  communicationTemplateCategoryLabels,
  communicationTemplateCategoryOptions,
} from "@/modules/communications/constants";
import type { CommunicationTemplate } from "@/modules/communications/types";

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <span className="text-xs text-[var(--danger)]">{errors[0]}</span> : null;
}

function TemplateForm({ template, onCancel }: { template: CommunicationTemplate | null; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(saveCommunicationTemplate, initialFormState);

  return (
    <Card className="p-5 lg:p-6">
      <form action={formAction} className="space-y-5">
        {template && <input type="hidden" name="templateId" value={template.id} />}
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">{template ? "Изменить шаблон" : "Новый шаблон"}</h2><p className="mt-1 text-xs text-[var(--muted)]">Доступны переменные: {"{{recipient_name}}"}, {"{{clinic_name}}"}, а для будущих автоматизаций — {"{{appointment_date}}"}, {"{{appointment_time}}"}, {"{{doctor_name}}"}, {"{{recall_date}}"}.</p></div>{template && <Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button>}</div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium">Название *</span><Input name="name" defaultValue={template?.name ?? ""} maxLength={160} required /><FieldError errors={state.fieldErrors?.name} /></label>
          <label className="space-y-2"><span className="text-sm font-medium">Категория *</span><select name="category" defaultValue={template?.category ?? "general"} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">{communicationTemplateCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError errors={state.fieldErrors?.category} /></label>
          <label className="space-y-2"><span className="text-sm font-medium">Канал</span><select name="channel" defaultValue={template?.channel ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm"><option value="">Любой канал</option>{communicationChannelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError errors={state.fieldErrors?.channel} /></label>
          <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium">Тема письма</span><Input name="subject" defaultValue={template?.subject ?? ""} maxLength={240} /><FieldError errors={state.fieldErrors?.subject} /></label>
        </div>
        <label className="block space-y-2"><span className="text-sm font-medium">Текст *</span><textarea name="body" defaultValue={template?.body ?? ""} rows={7} maxLength={5000} className="w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" required /><FieldError errors={state.fieldErrors?.body} /></label>
        {state.message && <div role="status" className={state.status === "error" ? "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]" : "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"}>{state.message}</div>}
        <div className="flex justify-end"><Button disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Сохранение…" : "Сохранить шаблон"}</Button></div>
      </form>
    </Card>
  );
}

export function CommunicationTemplateManager({ templates }: { templates: CommunicationTemplate[] }) {
  const [editingTemplate, setEditingTemplate] = useState<CommunicationTemplate | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Шаблоны</h2><p className="mt-1 text-xs text-[var(--muted)]">{templates.length} шаблонов в справочнике.</p></div>{editingTemplate && <Button variant="secondary" onClick={() => setEditingTemplate(null)}><Plus className="size-4" />Новый</Button>}</div>
        {templates.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center"><div><FileText className="mx-auto size-8 text-[var(--brand)]" /><h3 className="mt-4 font-semibold">Шаблонов пока нет</h3><p className="mt-1 text-sm text-[var(--muted)]">Создайте первый текст для коммуникаций.</p></div></div>
        ) : (
          <div className="divide-y">
            {templates.map((template) => (
              <div key={template.id} className={template.isActive ? "p-5" : "bg-[var(--surface-muted)] p-5 opacity-70"}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{template.name}</p>{!template.isActive && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold">Архив</span>}</div><p className="mt-1 text-xs text-[var(--muted)]">{communicationTemplateCategoryLabels[template.category]} · {template.channel ? communicationChannelLabels[template.channel] : "любой канал"}</p><p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6">{template.body}</p></div>
                  <div className="flex shrink-0 gap-1"><button type="button" onClick={() => setEditingTemplate(template)} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={`Изменить шаблон ${template.name}`}><Pencil className="size-4" /></button><form action={setCommunicationTemplateActive}><input type="hidden" name="templateId" value={template.id} /><input type="hidden" name="isActive" value={template.isActive ? "false" : "true"} /><button className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={template.isActive ? `Архивировать шаблон ${template.name}` : `Восстановить шаблон ${template.name}`}><Power className="size-4" /></button></form></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <TemplateForm key={editingTemplate?.id ?? "new"} template={editingTemplate} onCancel={() => setEditingTemplate(null)} />
    </div>
  );
}
