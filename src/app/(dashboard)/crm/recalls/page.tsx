import Link from "next/link";
import {
  AlarmClock,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  CircleAlert,
  Filter,
  ListChecks,
  Search,
  Stethoscope,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { recallStatusLabels, recallStatusOptions, recallTypeLabels, recallTypeOptions } from "@/modules/recalls/constants";
import { getRecallSummary, listRecallDoctors, listRecalls } from "@/modules/recalls/repository";
import { recallFiltersSchema } from "@/modules/recalls/schemas";
import { RecallStatusActions } from "@/modules/recalls/recall-status-actions";
import { RecallTaskGenerator } from "@/modules/recalls/recall-task-generator";
import type { RecallStatus } from "@/modules/recalls/types";

const statusClasses: Record<RecallStatus, string> = {
  scheduled: "bg-slate-100 text-slate-700",
  due: "bg-amber-50 text-amber-800",
  contacted: "bg-sky-50 text-sky-800",
  booked: "bg-violet-50 text-violet-800",
  completed: "bg-emerald-50 text-emerald-800",
  cancelled: "bg-rose-50 text-rose-800",
};

export default async function RecallsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
    doctor?: string;
    due?: string;
    created?: string;
  }>;
}) {
  const query = await searchParams;
  const parsed = recallFiltersSchema.safeParse(query);
  const filters = parsed.success
    ? { ...parsed.data, status: parsed.data.status ?? "active" as const }
    : { q: "", status: "active" as const };
  const [recalls, summary, doctors, context] = await Promise.all([
    listRecalls(filters),
    getRecallSummary(),
    listRecallDoctors(),
    getOrganizationContext(),
  ]);
  if (!context) return null;

  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">CRM · возврат пациентов</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Повторные визиты</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Гигиена, контрольные осмотры и незавершённое лечение.</p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          {context.can("tasks.read") && <Link href="/crm/tasks"><Button variant="secondary"><ListChecks className="size-4" />Задачи</Button></Link>}
          {context.can("recalls.manage") && context.can("tasks.manage") && <RecallTaskGenerator pendingCount={summary.tasksPending} />}
          {context.can("recalls.manage") && <Link href="/crm/recalls/new"><Button><CalendarPlus className="size-4" />Новый повторный визит</Button></Link>}
        </div>
      </div>

      {query.created === "1" && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="size-4" />Повторный визит запланирован.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Активные</p><p className="mt-2 text-2xl font-semibold">{summary.active}</p></div><CalendarClock className="size-6 text-[var(--brand)]" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Просрочены</p><p className="mt-2 text-2xl font-semibold">{summary.overdue}</p></div><CircleAlert className="size-6 text-rose-600" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">На сегодня</p><p className="mt-2 text-2xl font-semibold">{summary.dueToday}</p></div><AlarmClock className="size-6 text-amber-600" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Ждут задачи</p><p className="mt-2 text-2xl font-semibold">{summary.tasksPending}</p></div><ListChecks className="size-6 text-violet-600" /></div></Card>
      </div>

      <Card className="p-4">
        <form action="/crm/recalls" className="grid gap-3 xl:grid-cols-[1fr_180px_210px_210px_150px_auto_auto]">
          <div className="relative"><Search className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" /><Input name="q" defaultValue={filters.q} className="pl-10" placeholder="Пациент, номер или телефон" aria-label="Поиск повторных визитов" /></div>
          <select name="status" defaultValue={filters.status ?? "active"} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="active">Активные</option><option value="all">Все статусы</option>{recallStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
          <select name="type" defaultValue={filters.type ?? "all"} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="all">Все типы</option>{recallTypeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
          <select name="doctor" defaultValue={filters.doctor ?? ""} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="">Все врачи</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName}</option>)}</select>
          <select name="due" defaultValue={filters.due ?? "all"} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="all">Любая дата</option><option value="overdue">Просроченные</option><option value="today">На сегодня</option><option value="upcoming">Предстоящие</option></select>
          <Button type="submit" variant="secondary"><Filter className="size-4" />Применить</Button>
          <Link href="/crm/recalls"><Button type="button" variant="ghost">Сбросить</Button></Link>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Реестр повторных визитов</h2><p className="mt-0.5 text-xs text-[var(--muted)]">Найдено: {recalls.length}</p></div></div>
        {recalls.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><CalendarClock className="size-6" /></div><h3 className="mt-4 font-semibold">Повторные визиты не найдены</h3><p className="mt-1 text-sm text-[var(--muted)]">Измените фильтры или запланируйте первый контроль.</p></div></div>
        ) : (
          <div className="divide-y">
            {recalls.map((recall) => (
              <div key={recall.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_210px_230px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {context.can("patients.read") ? <Link href={`/patients/${recall.patientId}`} className="font-semibold hover:text-[var(--brand)]">{recall.patientName}</Link> : <h3 className="font-semibold">{recall.patientName}</h3>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses[recall.status]}`}>{recallStatusLabels[recall.status]}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">№ {recall.patientNumber} · {recall.patientPhone}</p>
                  <p className="mt-3 text-sm font-medium">{recallTypeLabels[recall.type]}</p>
                  {recall.notes && <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{recall.notes}</p>}
                </div>
                <div className="text-sm">
                  <p className={`flex items-center gap-2 ${recall.isOverdue ? "font-semibold text-[var(--danger)]" : ""}`}><AlarmClock className="size-4" />{recall.isOverdue ? "Просрочено: " : "Дата: "}{date.format(new Date(`${recall.dueDate}T00:00:00.000Z`))}</p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]"><Stethoscope className="size-4" />{recall.doctorName ?? "Врач не назначен"}</p>
                  {recall.taskId && context.can("tasks.read") && <Link href={`/crm/tasks?q=${encodeURIComponent(recall.patientName)}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline"><ListChecks className="size-3.5" />Задача сформирована</Link>}
                </div>
                {context.can("recalls.manage") ? <RecallStatusActions recallId={recall.id} status={recall.status} /> : <span className="text-xs text-[var(--muted)]">Только просмотр</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
