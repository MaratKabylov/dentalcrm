"use client";

import { useActionState } from "react";
import { CalendarPlus, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { saveRecall } from "@/modules/recalls/actions";
import { recallTypeOptions } from "@/modules/recalls/constants";
import type { RecallDoctorOption, RecallPatientOption } from "@/modules/recalls/types";

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <span className="text-xs text-[var(--danger)]">{errors[0]}</span> : null;
}

export function RecallForm({
  patients,
  doctors,
  defaultPatientId,
}: {
  patients: RecallPatientOption[];
  doctors: RecallDoctorOption[];
  defaultPatientId?: string;
}) {
  const [state, formAction, pending] = useActionState(saveRecall, initialFormState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">Пациент *</span>
          <select name="patientId" defaultValue={defaultPatientId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required>
            <option value="">Выберите пациента</option>
            {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.label} · {patient.secondary}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.patientId} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Тип повторного визита *</span>
          <select name="recallType" defaultValue="control_visit" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required>
            {recallTypeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.recallType} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Дата контакта *</span>
          <Input name="dueDate" type="date" required />
          <FieldError errors={state.fieldErrors?.dueDate} />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">Врач</span>
          <select name="doctorId" defaultValue="" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Не назначен</option>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName} · {doctor.specializationName}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.doctorId} />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Комментарий</span>
        <textarea name="notes" rows={5} maxLength={5000} placeholder="Что нужно проверить или обсудить с пациентом" className="w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" />
        <FieldError errors={state.fieldErrors?.notes} />
      </label>

      {state.message && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{state.message}</div>}

      <div className="flex justify-end">
        <Button className="min-w-48" disabled={pending || patients.length === 0}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
          {pending ? "Создание…" : "Запланировать визит"}
        </Button>
      </div>
    </form>
  );
}
