"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { saveLead } from "@/modules/crm/actions";
import type { CrmAssignee, CrmOption, LeadListItem, PatientSource } from "@/modules/crm/types";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

export function LeadForm({
  lead,
  sources,
  branches,
  assignees,
}: {
  lead?: LeadListItem;
  sources: PatientSource[];
  branches: CrmOption[];
  assignees: CrmAssignee[];
}) {
  const [state, formAction, pending] = useActionState(saveLead, initialFormState);

  return (
    <form action={formAction} className="space-y-6">
      {lead && <input type="hidden" name="leadId" value={lead.id} />}
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Имя лида *</span>
          <Input name="fullName" defaultValue={lead?.fullName ?? ""} autoComplete="name" maxLength={200} required />
          <FieldError errors={state.fieldErrors?.fullName} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Телефон *</span>
          <Input name="phone" defaultValue={lead?.phone ?? ""} type="tel" autoComplete="tel" placeholder="+7 700 000 00 00" required />
          <FieldError errors={state.fieldErrors?.phone} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Email</span>
          <Input name="email" defaultValue={lead?.email ?? ""} type="email" autoComplete="email" maxLength={254} />
          <FieldError errors={state.fieldErrors?.email} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Источник</span>
          <select name="sourceId" defaultValue={lead?.sourceId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Неизвестно</option>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name}{source.isActive ? "" : " (неактивен)"}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.sourceId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Филиал</span>
          <select name="branchId" defaultValue={lead?.branchId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Не выбран</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.branchId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Ответственный</span>
          <select name="assignedTo" defaultValue={lead?.assignedTo ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Не назначен</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.fullName}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.assignedTo} />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Комментарий</span>
        <textarea name="notes" defaultValue={lead?.notes ?? ""} rows={5} maxLength={5000} className="w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" />
        <FieldError errors={state.fieldErrors?.notes} />
      </label>

      {state.message && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{state.message}</div>}

      <div className="flex justify-end">
        <Button className="min-w-44" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pending ? "Сохранение…" : lead ? "Сохранить изменения" : "Создать лид"}
        </Button>
      </div>
    </form>
  );
}
