import Link from "next/link";
import { CircleAlert, Clock3, ListChecks, Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import { communicationChannelLabels } from "@/modules/communications/constants";
import { listCommunicationTemplates } from "@/modules/communications/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { reminderEventLabels, reminderJobStatusLabels } from "@/modules/reminders/constants";
import { ReminderRuleManager } from "@/modules/reminders/reminder-rule-manager";
import { getReminderSummary, listAutomationRules, listReminderJobs } from "@/modules/reminders/repository";
import type { ReminderJobStatus } from "@/modules/reminders/types";

const statusClasses: Record<ReminderJobStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  queued: "bg-emerald-50 text-emerald-800",
  skipped: "bg-slate-100 text-slate-700",
  failed: "bg-rose-50 text-rose-800",
};

export default async function RemindersPage() {
  const [rules, jobs, summary, templates, context] = await Promise.all([
    listAutomationRules(),
    listReminderJobs(),
    getReminderSummary(),
    listCommunicationTemplates(false),
    getOrganizationContext(),
  ]);
  if (!context) return null;
  const dateTime = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: context.organization.timezone,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div><p className="text-sm font-semibold text-[var(--brand)]">CRM · автоматизация</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Напоминания</h1><p className="mt-2 text-sm text-[var(--muted)]">Правила по записям и повторным визитам создают сообщения без дублей. Для отправки подключите провайдера к очереди коммуникаций.</p></div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-[var(--muted)]">Активные правила</p><p className="mt-2 text-2xl font-semibold">{summary.activeRules}</p></Card>
        <Card className="p-4"><p className="text-xs text-[var(--muted)]">Ожидают срока</p><p className="mt-2 text-2xl font-semibold">{summary.pendingJobs}</p></Card>
        <Card className="p-4"><p className="text-xs text-[var(--muted)]">Пора обработать</p><p className="mt-2 text-2xl font-semibold text-amber-700">{summary.dueJobs}</p></Card>
        <Card className="p-4"><p className="text-xs text-[var(--muted)]">Ошибки</p><p className="mt-2 text-2xl font-semibold text-rose-700">{summary.failedJobs}</p></Card>
      </div>

      <ReminderRuleManager rules={rules} templates={templates} canManage={context.can("automation.manage")} />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Последние задания</h2><p className="mt-1 text-xs text-[var(--muted)]">Созданные и обработанные срабатывания правил.</p></div><ListChecks className="size-5 text-[var(--brand)]" /></div>
        {jobs.length === 0 ? (
          <div className="grid min-h-56 place-items-center p-8 text-center"><div><Clock3 className="mx-auto size-8 text-[var(--brand)]" /><h3 className="mt-4 font-semibold">Заданий пока нет</h3><p className="mt-1 text-sm text-[var(--muted)]">Запустите обработку после создания правила.</p></div></div>
        ) : (
          <div className="divide-y">{jobs.map((job) => <div key={job.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_220px_180px] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><Link href={`/patients/${job.patientId}`} className="font-semibold hover:text-[var(--brand)]">{job.patientName}</Link><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses[job.status]}`}>{reminderJobStatusLabels[job.status]}</span></div><p className="mt-1 text-sm text-[var(--muted)]">{job.ruleName} · {reminderEventLabels[job.eventCode]}</p>{job.errorMessage && <p className="mt-2 flex items-center gap-1 text-xs text-[var(--danger)]"><CircleAlert className="size-3.5" />{job.errorMessage}</p>}</div><p className="text-sm">{communicationChannelLabels[job.channel]}</p><div className="text-xs text-[var(--muted)]"><p>Срок: {dateTime.format(new Date(job.scheduledFor))}</p>{job.appointmentId && <Link href="/calendar" className="mt-1 inline-block hover:text-[var(--brand)]">Открыть календарь</Link>}{job.recallId && <Link href="/crm/recalls" className="mt-1 inline-block hover:text-[var(--brand)]">Открыть recalls</Link>}</div></div>)}</div>
        )}
      </Card>

      {templates.length === 0 && context.can("communications.manage") && <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Zap className="size-5 shrink-0" /><span>Для правил нужен хотя бы один активный шаблон. <Link href="/crm/communications/templates" className="font-semibold underline">Создать шаблон</Link></span></Card>}
    </div>
  );
}
