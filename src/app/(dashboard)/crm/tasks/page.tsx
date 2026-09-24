import Link from "next/link";
import {
  AlarmClock,
  CalendarClock,
  CalendarCheck2,
  CheckCircle2,
  CircleAlert,
  Filter,
  Link2,
  ListTodo,
  Plus,
  Search,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { taskPriorityLabels, taskPriorityOptions, taskStatusLabels, taskStatusOptions } from "@/modules/tasks/constants";
import { getTaskSummary, listTaskAssignees, listTasks } from "@/modules/tasks/repository";
import { taskFiltersSchema } from "@/modules/tasks/schemas";
import { TaskStatusActions } from "@/modules/tasks/task-status-actions";
import type { TaskPriority, TaskStatus } from "@/modules/tasks/types";

const statusClasses: Record<TaskStatus, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-sky-50 text-sky-800",
  done: "bg-emerald-50 text-emerald-800",
  cancelled: "bg-rose-50 text-rose-800",
};

const priorityClasses: Record<TaskPriority, string> = {
  low: "text-slate-600",
  normal: "text-teal-700",
  high: "text-amber-700",
  urgent: "text-rose-700",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
    assignee?: string;
    due?: string;
    created?: string;
  }>;
}) {
  const query = await searchParams;
  const parsed = taskFiltersSchema.safeParse(query);
  const filters = parsed.success
    ? { ...parsed.data, status: parsed.data.status ?? "open" as const }
    : { q: "", status: "open" as const };
  const [tasks, summary, assignees, context] = await Promise.all([
    listTasks(filters),
    getTaskSummary(),
    listTaskAssignees(),
    getOrganizationContext(),
  ]);
  if (!context) return null;

  const dateTime = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: context.organization.timezone,
  });
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">CRM · контроль работы</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Задачи</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Звонки, подтверждения, внутренние поручения и работа с пациентами.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {context.can("crm.read") && <Link href="/crm/leads"><Button variant="secondary">Лиды</Button></Link>}
          {context.can("recalls.read") && <Link href="/crm/recalls"><Button variant="secondary"><CalendarClock className="size-4" />Повторные визиты</Button></Link>}
          {context.can("tasks.manage") && <Link href="/crm/tasks/new"><Button><Plus className="size-4" />Новая задача</Button></Link>}
        </div>
      </div>

      {query.created === "1" && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="size-4" />Задача создана.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Активные</p><p className="mt-2 text-2xl font-semibold">{summary.active}</p></div><ListTodo className="size-6 text-[var(--brand)]" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Просрочены</p><p className="mt-2 text-2xl font-semibold">{summary.overdue}</p></div><CircleAlert className="size-6 text-rose-600" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">На сегодня</p><p className="mt-2 text-2xl font-semibold">{summary.dueToday}</p></div><AlarmClock className="size-6 text-amber-600" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Выполнены</p><p className="mt-2 text-2xl font-semibold">{summary.completed}</p></div><CalendarCheck2 className="size-6 text-emerald-600" /></div></Card>
      </div>

      <Card className="p-4">
        <form action="/crm/tasks" className="grid gap-3 xl:grid-cols-[1fr_170px_160px_190px_150px_auto_auto]">
          <div className="relative"><Search className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" /><Input name="q" defaultValue={filters.q} className="pl-10" placeholder="Название или описание" aria-label="Поиск задач" /></div>
          <select name="status" defaultValue={filters.status ?? "open"} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="open">Активные</option><option value="all">Все статусы</option>{taskStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
          <select name="priority" defaultValue={filters.priority ?? "all"} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="all">Все приоритеты</option>{taskPriorityOptions.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select>
          <select name="assignee" defaultValue={filters.assignee ?? ""} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="">Все исполнители</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.fullName}</option>)}</select>
          <select name="due" defaultValue={filters.due ?? "all"} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="all">Любой срок</option><option value="overdue">Просроченные</option><option value="today">На сегодня</option><option value="no_due">Без срока</option></select>
          <Button type="submit" variant="secondary"><Filter className="size-4" />Применить</Button>
          <Link href="/crm/tasks"><Button type="button" variant="ghost">Сбросить</Button></Link>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Реестр задач</h2><p className="mt-0.5 text-xs text-[var(--muted)]">Найдено: {tasks.length}</p></div></div>
        {tasks.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><ListTodo className="size-6" /></div><h3 className="mt-4 font-semibold">Задачи не найдены</h3><p className="mt-1 text-sm text-[var(--muted)]">Измените фильтры или создайте первую задачу.</p></div></div>
        ) : (
          <div className="divide-y">
            {tasks.map((task) => {
              const relationHref = task.relatedEntityType === "lead" && context.can("crm.read")
                ? `/crm/leads/${task.relatedEntityId}`
                : task.relatedEntityType === "patient" && context.can("patients.read")
                  ? `/patients/${task.relatedEntityId}`
                  : null;

              return (
                <div key={task.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_190px_230px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{task.title}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses[task.status]}`}>{taskStatusLabels[task.status]}</span>
                      <span className={`text-[11px] font-semibold ${priorityClasses[task.priority]}`}>{taskPriorityLabels[task.priority]}</span>
                    </div>
                    {task.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{task.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                      <span>{task.branchName ?? "Без филиала"}</span>
                      <span>Создал: {task.creatorName}</span>
                      {relationHref && task.relatedEntityName ? <Link href={relationHref} className="inline-flex items-center gap-1 font-medium text-[var(--brand)] hover:underline"><Link2 className="size-3" />{task.relatedEntityName}</Link> : task.relatedEntityName && <span className="inline-flex items-center gap-1"><Link2 className="size-3" />{task.relatedEntityName}</span>}
                    </div>
                  </div>
                  <div className="text-sm">
                    <p className="flex items-center gap-2"><UserRound className="size-4 text-[var(--muted)]" />{task.assigneeName ?? "Не назначен"}</p>
                    <p className={`mt-2 flex items-center gap-2 text-xs ${task.isOverdue ? "font-semibold text-[var(--danger)]" : "text-[var(--muted)]"}`}><AlarmClock className="size-4" />{task.dueAt ? `${task.isOverdue ? "Просрочено: " : "Срок: "}${dateTime.format(new Date(task.dueAt))}` : "Без срока"}</p>
                  </div>
                  {context.can("tasks.manage") ? <TaskStatusActions taskId={task.id} status={task.status} /> : <span className="text-xs text-[var(--muted)]">Только просмотр</span>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
