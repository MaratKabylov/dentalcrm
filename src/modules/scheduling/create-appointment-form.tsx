"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarPlus, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { createAppointment } from "@/modules/scheduling/actions";
import type { AppointmentFormOptions } from "@/modules/scheduling/types";

function ErrorText({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <span className="text-xs text-[var(--danger)]">{errors[0]}</span> : null;
}

export function CreateAppointmentForm({
  options,
  defaultDate,
  defaultPatientId,
}: {
  options: AppointmentFormOptions;
  defaultDate: string;
  defaultPatientId?: string;
}) {
  const [state, action, pending] = useActionState(createAppointment, initialFormState);
  const firstBranch = options.doctors[0]?.branchId ?? "";
  const [branchId, setBranchId] = useState(firstBranch);
  const doctors = useMemo(
    () => options.doctors.filter((doctor) => doctor.branchId === branchId),
    [branchId, options.doctors],
  );
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");
  const selectedDoctor = doctors.find((doctor) => doctor.id === doctorId) ?? doctors[0];
  const branches = Array.from(new Map(options.doctors.map((doctor) => [doctor.branchId, doctor.branchName])).entries());

  function changeBranch(value: string) {
    setBranchId(value);
    setDoctorId(options.doctors.find((doctor) => doctor.branchId === value)?.id ?? "");
  }

  return (
    <form action={action} className="space-y-7">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Филиал *</span>
          <select name="branchId" value={branchId} onChange={(event) => changeBranch(event.target.value)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required>
            {branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <ErrorText errors={state.fieldErrors?.branchId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Пациент *</span>
          <select name="patientId" defaultValue={defaultPatientId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required>
            <option value="">Выберите пациента</option>
            {options.patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.lastName} {patient.firstName} · {patient.phone}</option>
            ))}
          </select>
          <ErrorText errors={state.fieldErrors?.patientId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Врач *</span>
          <select name="doctorId" value={selectedDoctor?.id ?? ""} onChange={(event) => setDoctorId(event.target.value)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName} · {doctor.specializationName}</option>)}
          </select>
          <ErrorText errors={state.fieldErrors?.doctorId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Кабинет</span>
          <Input value={selectedDoctor?.roomName ?? "Не назначен"} readOnly className="bg-[var(--surface-muted)]" />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Дата *</span>
          <Input name="date" type="date" defaultValue={defaultDate} required />
          <ErrorText errors={state.fieldErrors?.date} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Время *</span>
          <Input name="startTime" type="time" defaultValue="09:00" step={300} required />
          <ErrorText errors={state.fieldErrors?.startTime} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Длительность</span>
          <Input name="durationMinutes" type="number" min={5} max={480} step={5} value={selectedDoctor?.appointmentDurationMinutes ?? 30} readOnly />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Причина обращения</span>
          <Input name="reason" placeholder="Консультация, осмотр…" />
        </label>
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Комментарий регистратуры</span>
        <textarea name="notes" rows={3} className="w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm" />
      </label>
      {state.message && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{state.message}</div>}
      <div className="flex justify-end">
        <Button disabled={pending || !selectedDoctor || options.patients.length === 0} className="min-w-40">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
          {pending ? "Создание…" : "Создать запись"}
        </Button>
      </div>
    </form>
  );
}
