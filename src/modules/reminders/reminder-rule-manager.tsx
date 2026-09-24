"use client";

import { useActionState, useMemo, useState } from "react";
import { LoaderCircle, Pencil, Play, Plus, Power, Save, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import {
  communicationChannelLabels,
  communicationChannelOptions,
} from "@/modules/communications/constants";
import type { CommunicationChannel, CommunicationTemplate } from "@/modules/communications/types";
import {
  runReminderAutomation,
  saveAutomationRule,
  setAutomationRuleActive,
} from "@/modules/reminders/actions";
import { reminderEventLabels, reminderEventOptions } from "@/modules/reminders/constants";
import type { AutomationRule } from "@/modules/reminders/types";

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <span className="text-xs text-[var(--danger)]">{errors[0]}</span> : null;
}

function RuleForm({
  rule,
  templates,
  onCancel,
}: {
  rule: AutomationRule | null;
  templates: CommunicationTemplate[];
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveAutomationRule, initialFormState);
  const [channel, setChannel] = useState<CommunicationChannel>(rule?.channel ?? "whatsapp");
  const compatibleTemplates = useMemo(
    () => templates.filter((template) => template.channel === null || template.channel === channel),
    [channel, templates],
  );

  return (
    <Card className="p-5 lg:p-6">
      <form action={formAction} className="space-y-5">
        {rule && <input type="hidden" name="ruleId" value={rule.id} />}
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="font-semibold">{rule ? "Изменить правило" : "Новое правило"}</h2><p className="mt-1 text-xs text-[var(--muted)]">Одно событие, один канал и один шаблон.</p></div>
          {rule && <Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button>}
        </div>
        <label className="block space-y-2"><span className="text-sm font-medium">Название *</span><Input name="name" defaultValue={rule?.name ?? ""} maxLength={160} required /><FieldError errors={state.fieldErrors?.name} /></label>
        <label className="block space-y-2"><span className="text-sm font-medium">Событие *</span><select name="eventCode" defaultValue={rule?.eventCode ?? "appointment_before_24h"} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">{reminderEventOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError errors={state.fieldErrors?.eventCode} /></label>
        <label className="block space-y-2"><span className="text-sm font-medium">Канал *</span><select name="channel" value={channel} onChange={(event) => setChannel(event.target.value as CommunicationChannel)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">{communicationChannelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError errors={state.fieldErrors?.channel} /></label>
        <label className="block space-y-2"><span className="text-sm font-medium">Шаблон *</span><select name="templateId" defaultValue={rule?.templateId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required><option value="">Выберите шаблон</option>{compatibleTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><FieldError errors={state.fieldErrors?.templateId} />{compatibleTemplates.length === 0 && <span className="text-xs text-amber-700">Для этого канала нет активных шаблонов.</span>}</label>
        {state.message && <div role="status" className={state.status === "error" ? "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]" : "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"}>{state.message}</div>}
        <div className="flex justify-end"><Button disabled={pending || compatibleTemplates.length === 0}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Сохранение…" : "Сохранить правило"}</Button></div>
      </form>
    </Card>
  );
}

function RunAutomationButton() {
  const [state, formAction, pending] = useActionState(runReminderAutomation, initialFormState);
  return (
    <div className="space-y-2">
      <form action={formAction}><Button disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}{pending ? "Обработка…" : "Обработать сейчас"}</Button></form>
      {state.message && <p role="status" className={state.status === "error" ? "max-w-xl text-xs text-[var(--danger)]" : "max-w-xl text-xs text-emerald-700"}>{state.message}</p>}
    </div>
  );
}

export function ReminderRuleManager({
  rules,
  templates,
  canManage,
}: {
  rules: AutomationRule[];
  templates: CommunicationTemplate[];
  canManage: boolean;
}) {
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  return (
    <div className="space-y-6">
      {canManage && <div className="flex justify-end"><RunAutomationButton /></div>}
      <div className={canManage ? "grid gap-6 lg:grid-cols-[1fr_0.9fr]" : "grid gap-6"}>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Правила</h2><p className="mt-1 text-xs text-[var(--muted)]">{rules.length} правил в организации.</p></div>{editingRule && <Button variant="secondary" onClick={() => setEditingRule(null)}><Plus className="size-4" />Новое</Button>}</div>
          {rules.length === 0 ? (
            <div className="grid min-h-72 place-items-center p-8 text-center"><div><Zap className="mx-auto size-9 text-[var(--brand)]" /><h3 className="mt-4 font-semibold">Правил пока нет</h3><p className="mt-1 text-sm text-[var(--muted)]">Создайте первое автоматическое напоминание.</p></div></div>
          ) : (
            <div className="divide-y">{rules.map((rule) => <div key={rule.id} className={rule.isActive ? "p-5" : "bg-[var(--surface-muted)] p-5 opacity-70"}><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{rule.name}</p>{!rule.isActive && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold">Выключено</span>}</div><p className="mt-1 text-sm text-[var(--muted)]">{reminderEventLabels[rule.eventCode]}</p><p className="mt-2 text-xs text-[var(--muted)]">{communicationChannelLabels[rule.channel]} · {rule.templateName}</p></div>{canManage && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => setEditingRule(rule)} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={`Изменить правило ${rule.name}`}><Pencil className="size-4" /></button><form action={setAutomationRuleActive}><input type="hidden" name="ruleId" value={rule.id} /><input type="hidden" name="isActive" value={rule.isActive ? "false" : "true"} /><button className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={rule.isActive ? `Выключить правило ${rule.name}` : `Включить правило ${rule.name}`}><Power className="size-4" /></button></form></div>}</div></div>)}</div>
          )}
        </Card>
        {canManage && <RuleForm key={editingRule?.id ?? "new"} rule={editingRule} templates={templates} onCancel={() => setEditingRule(null)} />}
      </div>
    </div>
  );
}
