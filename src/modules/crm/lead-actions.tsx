"use client";

import { useActionState } from "react";
import { LoaderCircle, MessageSquarePlus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initialFormState } from "@/modules/auth/types";
import { addLeadActivity, setLeadStatus } from "@/modules/crm/actions";
import { editableLeadStatusOptions, leadActivityOptions } from "@/modules/crm/constants";
import type { LeadListItem } from "@/modules/crm/types";

function ActionMessage({ state }: { state: typeof initialFormState }) {
  if (!state.message) return null;
  return <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" : "rounded-xl bg-red-50 px-3 py-2 text-xs text-[var(--danger)]"}>{state.message}</div>;
}

function StatusForm({ lead }: { lead: LeadListItem }) {
  const [state, formAction, pending] = useActionState(setLeadStatus, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={lead.id} />
      <label className="block space-y-2">
        <span className="text-sm font-medium">Статус воронки</span>
        <select name="status" defaultValue={lead.status} disabled={lead.status === "converted"} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm disabled:bg-[var(--surface-muted)]">
          {lead.status === "converted" && <option value="converted">Стал пациентом</option>}
          {editableLeadStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
      </label>
      <ActionMessage state={state} />
      <Button disabled={pending || lead.status === "converted"} variant="secondary" className="w-full">
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        {pending ? "Обновление…" : "Обновить статус"}
      </Button>
    </form>
  );
}

function ActivityForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(addLeadActivity, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <label className="block space-y-2">
        <span className="text-sm font-medium">Тип контакта</span>
        <select name="type" defaultValue="note" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
          {leadActivityOptions.map((activity) => <option key={activity.value} value={activity.value}>{activity.label}</option>)}
        </select>
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Результат или заметка</span>
        <textarea name="body" rows={4} maxLength={5000} required className="w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" />
        {state.fieldErrors?.body?.[0] && <span className="text-xs text-[var(--danger)]">{state.fieldErrors.body[0]}</span>}
      </label>
      <ActionMessage state={state} />
      <Button disabled={pending} className="w-full">
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <MessageSquarePlus className="size-4" />}
        {pending ? "Сохранение…" : "Добавить активность"}
      </Button>
    </form>
  );
}

export function LeadActions({ lead }: { lead: LeadListItem }) {
  return (
    <div className="space-y-6">
      <StatusForm lead={lead} />
      <div className="border-t pt-5"><ActivityForm leadId={lead.id} /></div>
    </div>
  );
}
