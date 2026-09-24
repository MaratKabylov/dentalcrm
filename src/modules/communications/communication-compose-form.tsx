"use client";

import { useActionState, useMemo, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { queueCommunication } from "@/modules/communications/actions";
import { communicationChannelOptions } from "@/modules/communications/constants";
import { findCommunicationPlaceholders, renderCommunicationTemplate } from "@/modules/communications/template-renderer";
import type {
  CommunicationChannel,
  CommunicationTarget,
  CommunicationTargetType,
  CommunicationTemplate,
} from "@/modules/communications/types";

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <span className="text-xs text-[var(--danger)]">{errors[0]}</span> : null;
}

function contactFor(target: CommunicationTarget | undefined, channel: CommunicationChannel) {
  if (!target) return "";
  return channel === "email" ? target.email ?? "" : target.phone;
}

export function CommunicationComposeForm({
  targets,
  templates,
  organizationName,
  defaultTargetType,
  defaultTargetId,
}: {
  targets: CommunicationTarget[];
  templates: CommunicationTemplate[];
  organizationName: string;
  defaultTargetType?: CommunicationTargetType;
  defaultTargetId?: string;
}) {
  const [state, formAction, pending] = useActionState(queueCommunication, initialFormState);
  const [targetType, setTargetType] = useState<CommunicationTargetType>(defaultTargetType ?? "patient");
  const initialTargetId = defaultTargetType === targetType ? defaultTargetId ?? "" : "";
  const [targetId, setTargetId] = useState(initialTargetId);
  const [channel, setChannel] = useState<CommunicationChannel>("sms");
  const [templateId, setTemplateId] = useState("");
  const initialTarget = targets.find((target) => target.type === targetType && target.id === initialTargetId);
  const [recipient, setRecipient] = useState(contactFor(initialTarget, "sms"));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [unresolved, setUnresolved] = useState<string[]>([]);

  const availableTargets = useMemo(
    () => targets.filter((target) => target.type === targetType),
    [targetType, targets],
  );
  const availableTemplates = useMemo(
    () => templates.filter((template) => !template.channel || template.channel === channel),
    [channel, templates],
  );

  function updateUnresolvedVariables(nextSubject: string, nextBody: string) {
    setUnresolved([
      ...new Set([
        ...findCommunicationPlaceholders(nextSubject),
        ...findCommunicationPlaceholders(nextBody),
      ]),
    ]);
  }

  function changeTargetType(value: CommunicationTargetType) {
    setTargetType(value);
    setTargetId("");
    setRecipient("");
    setUnresolved([]);
  }

  function changeTarget(value: string) {
    setTargetId(value);
    const target = targets.find((item) => item.type === targetType && item.id === value);
    setRecipient(contactFor(target, channel));
    if (templateId) applyTemplate(templateId, target, channel);
  }

  function changeChannel(value: CommunicationChannel) {
    setChannel(value);
    const target = targets.find((item) => item.type === targetType && item.id === targetId);
    setRecipient(contactFor(target, value));
    const selectedTemplate = templates.find((template) => template.id === templateId);
    if (selectedTemplate?.channel && selectedTemplate.channel !== value) {
      setTemplateId("");
      setSubject("");
      setBody("");
      setUnresolved([]);
    } else if (selectedTemplate) {
      applyTemplate(selectedTemplate.id, target, value);
    }
  }

  function applyTemplate(
    value: string,
    target = targets.find((item) => item.type === targetType && item.id === targetId),
    selectedChannel = channel,
  ) {
    setTemplateId(value);
    const template = templates.find(
      (item) => item.id === value && (!item.channel || item.channel === selectedChannel),
    );
    if (!template) {
      setSubject("");
      setBody("");
      setUnresolved([]);
      return;
    }
    const variables = {
      recipient_name: target?.label,
      clinic_name: organizationName,
    };
    const renderedBody = renderCommunicationTemplate(template.body, variables);
    const renderedSubject = renderCommunicationTemplate(template.subject ?? "", variables);
    setSubject(renderedSubject.body);
    setBody(renderedBody.body);
    setUnresolved([...new Set([...renderedSubject.unresolved, ...renderedBody.unresolved])]);
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Тип получателя *</span>
          <select name="targetType" value={targetType} onChange={(event) => changeTargetType(event.target.value as CommunicationTargetType)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="patient">Пациент</option>
            <option value="lead">Лид</option>
          </select>
          <FieldError errors={state.fieldErrors?.targetType} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Получатель *</span>
          <select name="targetId" value={targetId} onChange={(event) => changeTarget(event.target.value)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required>
            <option value="">Выберите получателя</option>
            {availableTargets.map((target) => <option key={target.id} value={target.id}>{target.label} · {target.phone}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.targetId} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Канал *</span>
          <select name="channel" value={channel} onChange={(event) => changeChannel(event.target.value as CommunicationChannel)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            {communicationChannelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.channel} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Адрес получателя *</span>
          <Input name="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={channel === "email" ? "name@example.com" : "+7 700 000 00 00"} required />
          <FieldError errors={state.fieldErrors?.recipient} />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">Шаблон</span>
          <select name="templateId" value={templateId} onChange={(event) => applyTemplate(event.target.value)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Без шаблона</option>
            {availableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.templateId} />
        </label>

        {channel === "email" && (
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Тема</span>
            <Input name="subject" value={subject} onChange={(event) => { setSubject(event.target.value); updateUnresolvedVariables(event.target.value, body); }} maxLength={240} />
            <FieldError errors={state.fieldErrors?.subject} />
          </label>
        )}
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Сообщение *</span>
        <textarea name="body" value={body} onChange={(event) => { setBody(event.target.value); updateUnresolvedVariables(subject, event.target.value); }} rows={7} maxLength={5000} className="w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" required />
        <FieldError errors={state.fieldErrors?.body} />
      </label>

      {unresolved.length > 0 && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Заполните переменные вручную: {unresolved.map((name) => `{{${name}}}`).join(", ")}.</div>}
      <div className="rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">Сообщение будет поставлено в очередь. Фактическая отправка начнётся после подключения провайдера выбранного канала.</div>
      {state.message && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{state.message}</div>}

      <div className="flex justify-end">
        <Button className="min-w-48" disabled={pending || !targetId || !body.trim()}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          {pending ? "Постановка в очередь…" : "Поставить в очередь"}
        </Button>
      </div>
    </form>
  );
}
