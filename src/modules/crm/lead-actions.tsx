"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LoaderCircle, MessageSquarePlus, RefreshCw, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initialFormState } from "@/modules/auth/types";
import { addLeadActivity, convertLeadToPatient, setLeadStatus } from "@/modules/crm/actions";
import { editableLeadStatusOptions, leadActivityOptions } from "@/modules/crm/constants";
import type { LeadListItem } from "@/modules/crm/types";
import type { PatientListItem } from "@/modules/patients/types";

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

function patientName(patient: PatientListItem) {
  return [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ");
}

function ConversionForm({ lead, patients }: { lead: LeadListItem; patients: PatientListItem[] }) {
  const [state, formAction, pending] = useActionState(convertLeadToPatient, initialFormState);
  if (lead.convertedPatientId) {
    return <Link href={`/patients/${lead.convertedPatientId}`} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><UserCheck className="size-4" />Открыть карточку пациента</Link>;
  }
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={lead.id} />
      <div><h3 className="text-sm font-semibold">Конвертация в пациента</h3><p className="mt-1 text-xs text-[var(--muted)]">Найдены совпадения по телефону лида.</p></div>
      <select name="patientId" defaultValue="" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required>
        <option value="">Выберите пациента</option>
        {patients.map((patient) => <option key={patient.id} value={patient.id}>{patientName(patient)} · {patient.phone}</option>)}
      </select>
      {patients.length === 0 && <p className="text-xs text-amber-700">Совпадений нет. Сначала создайте карточку пациента.</p>}
      {state.message && <ActionMessage state={state} />}
      <div className="grid gap-2">
        <Button disabled={pending || patients.length === 0} className="w-full">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <UserCheck className="size-4" />}{pending ? "Связываем…" : "Связать с пациентом"}</Button>
        <Link href={`/patients/new?leadId=${lead.id}`} className="inline-flex h-10 items-center justify-center rounded-xl border bg-white px-4 text-sm font-semibold hover:bg-[var(--surface-muted)]">Создать нового пациента</Link>
      </div>
    </form>
  );
}

export function LeadActions({
  lead,
  patients = [],
  canConvert = false,
}: {
  lead: LeadListItem;
  patients?: PatientListItem[];
  canConvert?: boolean;
}) {
  return (
    <div className="space-y-6">
      <StatusForm lead={lead} />
      {(canConvert || lead.convertedPatientId) && <div className="border-t pt-5"><ConversionForm lead={lead} patients={patients} /></div>}
      <div className="border-t pt-5"><ActivityForm leadId={lead.id} /></div>
    </div>
  );
}
