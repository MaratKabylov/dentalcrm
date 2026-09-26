"use client";

import { useActionState, useState } from "react";
import { Archive, BriefcaseMedical, CalendarOff, CheckCircle2, Clock3, LoaderCircle, Plus, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import {
  saveDoctorBranchAssignment,
  saveDoctorScheduleException,
  setDoctorBranchAssignmentActive,
  setDoctorScheduleExceptionActive,
} from "@/modules/scheduling/actions";
import type {
  DoctorBranchAssignment,
  DoctorManagementDetail,
  DoctorScheduleException,
} from "@/modules/scheduling/types";

const weekdays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const exceptionLabels: Record<DoctorScheduleException["type"], string> = {
  day_off: "Выходной",
  sick_leave: "Больничный",
  vacation: "Отпуск",
  custom_hours: "Особые часы",
  blocked: "Заблокировано",
};

function StateMessage({ state }: { state: { status: string; message?: string } }) {
  if (!state.message) return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "mt-3 text-xs text-[var(--danger)]" : "mt-3 text-xs text-emerald-700"}>{state.message}</p>;
}

function AssignmentStatus({ doctorId, assignment }: { doctorId: string; assignment: DoctorBranchAssignment }) {
  const [state, action, pending] = useActionState(setDoctorBranchAssignmentActive, initialFormState);
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="doctorId" value={doctorId} />
        <input type="hidden" name="branchId" value={assignment.branchId} />
        <input type="hidden" name="isActive" value={assignment.isActive ? "false" : "true"} />
        <Button variant="ghost" disabled={pending} className={assignment.isActive ? "text-[var(--danger)]" : "text-emerald-700"}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : assignment.isActive ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}
          {assignment.isActive ? "Архивировать назначение" : "Восстановить назначение"}
        </Button>
      </form>
      <StateMessage state={state} />
    </div>
  );
}

function AssignmentEditor({
  doctorId,
  branches,
  services,
  assignment,
}: {
  doctorId: string;
  branches: DoctorManagementDetail["branches"];
  services: DoctorManagementDetail["services"];
  assignment?: DoctorBranchAssignment;
}) {
  const [state, action, pending] = useActionState(saveDoctorBranchAssignment, initialFormState);
  const hoursByDay = new Map(assignment?.workingHours.map((hours) => [hours.weekday, hours]) ?? []);
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><BriefcaseMedical className="size-5" /></div>
          <div>
            <h2 className="font-semibold">{assignment?.branchName ?? "Добавить филиал"}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Кабинет, длительность, услуги и недельный график.</p>
          </div>
        </div>
        {assignment && <AssignmentStatus doctorId={doctorId} assignment={assignment} />}
      </div>
      <form action={action} className="mt-5 space-y-5">
        <input type="hidden" name="doctorId" value={doctorId} />
        {assignment ? <input type="hidden" name="branchId" value={assignment.branchId} /> : (
          <label className="block space-y-2">
            <span className="text-sm font-medium">Филиал *</span>
            <select name="branchId" defaultValue="" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required>
              <option value="">Выберите филиал</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-2 sm:col-span-1"><span className="text-sm font-medium">Кабинет *</span><Input name="roomName" defaultValue={assignment?.roomName ?? ""} required /></label>
          <label className="space-y-2"><span className="text-sm font-medium">Приём, минут</span><Input name="durationMinutes" type="number" min={5} max={480} step={5} defaultValue={assignment?.appointmentDurationMinutes ?? 30} required /></label>
          <label className="flex items-end gap-2 pb-3 text-sm"><input name="acceptsOnlineBooking" type="checkbox" defaultChecked={assignment?.acceptsOnlineBooking ?? false} />Онлайн-запись</label>
        </div>
        <div>
          <div className="mb-3 flex items-center gap-2"><Clock3 className="size-4 text-[var(--brand)]" /><h3 className="text-sm font-semibold">Рабочие часы</h3></div>
          <div className="space-y-2">
            {weekdays.map((label, index) => {
              const weekday = index + 1;
              const hours = hoursByDay.get(weekday);
              return <div key={weekday} className="grid gap-2 rounded-xl bg-[var(--surface-muted)] p-3 sm:grid-cols-[minmax(130px,1fr)_100px_120px_120px] sm:items-center"><span className="text-sm font-medium">{label}</span><label className="flex items-center gap-2 text-sm"><input name={`working-${weekday}`} type="checkbox" defaultChecked={hours ? true : !assignment && weekday <= 5} />Рабочий</label><Input name={`start-${weekday}`} type="time" defaultValue={hours?.startTime ?? "09:00"} aria-label={`Начало, ${label}`} /><Input name={`end-${weekday}`} type="time" defaultValue={hours?.endTime ?? "18:00"} aria-label={`Конец, ${label}`} /></div>;
            })}
          </div>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Доступные услуги</legend>
          <p className="mt-1 text-xs text-[var(--muted)]">Пустой список означает, что услуги врачу в этом филиале пока не назначены.</p>
          <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">
            {services.length === 0 ? <p className="text-sm text-[var(--muted)]">Сначала добавьте услуги в клинический справочник.</p> : services.map((service) => <label key={service.id} className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-[var(--surface-muted)]"><input name="serviceId" value={service.id} type="checkbox" defaultChecked={assignment?.serviceIds.includes(service.id) ?? false} className="mt-0.5" /><span><span className="font-medium">{service.name}</span><span className="ml-1 text-xs text-[var(--muted)]">{service.code}</span></span></label>)}
          </div>
        </fieldset>
        <div className="flex justify-end"><Button disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{assignment ? "Сохранить настройки" : "Добавить назначение"}</Button></div>
      </form>
      <StateMessage state={state} />
    </Card>
  );
}

function ExceptionStatus({ doctorId, exception }: { doctorId: string; exception: DoctorScheduleException }) {
  const [state, action, pending] = useActionState(setDoctorScheduleExceptionActive, initialFormState);
  return <div><form action={action}><input type="hidden" name="doctorId" value={doctorId} /><input type="hidden" name="exceptionId" value={exception.id} /><input type="hidden" name="isActive" value={exception.isActive ? "false" : "true"} /><Button variant="ghost" disabled={pending} className="px-2">{exception.isActive ? "В архив" : "Восстановить"}</Button></form><StateMessage state={state} /></div>;
}

function ScheduleExceptions({ detail }: { detail: DoctorManagementDetail }) {
  const [state, action, pending] = useActionState(saveDoctorScheduleException, initialFormState);
  const [type, setType] = useState<DoctorScheduleException["type"]>("day_off");
  const activeAssignments = detail.assignments.filter((assignment) => assignment.isActive);
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><CalendarOff className="size-5" /></div><div><h2 className="font-semibold">Исключения расписания</h2><p className="mt-1 text-sm text-[var(--muted)]">Отпуск, больничный, выходной или особые часы задаются отдельно для филиала.</p></div></div>
      <form action={action} className="mt-5 grid gap-3 lg:grid-cols-6 lg:items-end">
        <input type="hidden" name="doctorId" value={detail.id} />
        <label className="space-y-2 lg:col-span-2"><span className="text-sm font-medium">Филиал</span><select name="branchId" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" required>{activeAssignments.map((assignment) => <option key={assignment.branchId} value={assignment.branchId}>{assignment.branchName}</option>)}</select></label>
        <label className="space-y-2"><span className="text-sm font-medium">Дата</span><Input name="date" type="date" required /></label>
        <label className="space-y-2"><span className="text-sm font-medium">Тип</span><select name="type" value={type} onChange={(event) => setType(event.target.value as DoctorScheduleException["type"])} className="h-11 w-full rounded-xl border bg-white px-3 text-sm">{Object.entries(exceptionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-2"><span className="text-sm font-medium">С</span><Input name="startTime" type="time" disabled={type !== "custom_hours"} /></label>
        <label className="space-y-2"><span className="text-sm font-medium">До</span><Input name="endTime" type="time" disabled={type !== "custom_hours"} /></label>
        <label className="space-y-2 lg:col-span-5"><span className="text-sm font-medium">Причина</span><Input name="reason" maxLength={500} /></label>
        <Button disabled={pending || activeAssignments.length === 0}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Добавить</Button>
      </form>
      <StateMessage state={state} />
      <div className="mt-5 divide-y border-t">
        {detail.exceptions.length === 0 ? <p className="py-5 text-sm text-[var(--muted)]">Исключений пока нет.</p> : detail.exceptions.map((exception) => <div key={exception.id} className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold">{exception.date} · {exceptionLabels[exception.type]}</p><p className="mt-1 text-xs text-[var(--muted)]">{exception.branchName}{exception.startTime ? ` · ${exception.startTime}–${exception.endTime}` : ""}{exception.reason ? ` · ${exception.reason}` : ""}</p></div><div className="flex items-center gap-2">{exception.isActive ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-3.5" />Активно</span> : <span className="text-xs text-[var(--muted)]">Архив</span>}<ExceptionStatus doctorId={detail.id} exception={exception} /></div></div>)}
      </div>
    </Card>
  );
}

export function DoctorDetailManager({ detail }: { detail: DoctorManagementDetail }) {
  const assignedBranchIds = new Set(detail.assignments.map((assignment) => assignment.branchId));
  const availableBranches = detail.branches.filter((branch) => !assignedBranchIds.has(branch.id));
  return <div className="space-y-6">{detail.assignments.map((assignment) => <AssignmentEditor key={assignment.assignmentId} doctorId={detail.id} branches={detail.branches} services={detail.services} assignment={assignment} />)}{availableBranches.length > 0 && <AssignmentEditor doctorId={detail.id} branches={availableBranches} services={detail.services} />}<ScheduleExceptions detail={detail} /></div>;
}
