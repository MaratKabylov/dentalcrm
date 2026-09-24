import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCheck,
  CircleAlert,
  Clock3,
  FileText,
  Filter,
  Inbox,
  Plus,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  communicationChannelLabels,
  communicationChannelOptions,
  communicationStatusLabels,
} from "@/modules/communications/constants";
import { getCommunicationSummary, listCommunicationMessages } from "@/modules/communications/repository";
import { communicationFiltersSchema } from "@/modules/communications/schemas";
import type { CommunicationStatus } from "@/modules/communications/types";
import { getOrganizationContext } from "@/modules/organizations/repository";

const statusClasses: Record<CommunicationStatus, string> = {
  queued: "bg-amber-50 text-amber-800",
  sending: "bg-sky-50 text-sky-800",
  sent: "bg-blue-50 text-blue-800",
  delivered: "bg-emerald-50 text-emerald-800",
  failed: "bg-rose-50 text-rose-800",
  received: "bg-violet-50 text-violet-800",
  cancelled: "bg-slate-100 text-slate-700",
};

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    channel?: string;
    direction?: string;
    status?: string;
    queued?: string;
  }>;
}) {
  const query = await searchParams;
  const parsed = communicationFiltersSchema.safeParse(query);
  const filters = parsed.success ? parsed.data : { q: "" };
  const [messages, summary, context] = await Promise.all([
    listCommunicationMessages(filters),
    getCommunicationSummary(),
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
        <div><p className="text-sm font-semibold text-[var(--brand)]">CRM · единый журнал</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Коммуникации</h1><p className="mt-2 text-sm text-[var(--muted)]">Исходящие очереди и входящие сообщения по всем каналам.</p></div>
        {context.can("communications.manage") && <div className="flex flex-wrap gap-2"><Link href="/crm/communications/templates"><Button variant="secondary"><FileText className="size-4" />Шаблоны</Button></Link><Link href="/crm/communications/new"><Button><Plus className="size-4" />Новое сообщение</Button></Link></div>}
      </div>

      {query.queued === "1" && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CheckCheck className="size-4" />Сообщение поставлено в очередь.</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">В очереди</p><p className="mt-2 text-2xl font-semibold">{summary.queued}</p></div><Clock3 className="size-6 text-amber-600" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Отправлены</p><p className="mt-2 text-2xl font-semibold">{summary.sent}</p></div><ArrowUpRight className="size-6 text-blue-600" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Ошибки</p><p className="mt-2 text-2xl font-semibold">{summary.failed}</p></div><CircleAlert className="size-6 text-rose-600" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Входящие</p><p className="mt-2 text-2xl font-semibold">{summary.received}</p></div><ArrowDownLeft className="size-6 text-violet-600" /></div></Card>
      </div>

      <Card className="p-4">
        <form action="/crm/communications" className="grid gap-3 lg:grid-cols-[1fr_170px_170px_170px_auto_auto]">
          <div className="relative"><Search className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" /><Input name="q" defaultValue={filters.q} className="pl-10" placeholder="Получатель или текст" aria-label="Поиск коммуникаций" /></div>
          <select name="channel" defaultValue={filters.channel ?? "all"} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="all">Все каналы</option>{communicationChannelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select name="direction" defaultValue={filters.direction ?? "all"} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="all">Все направления</option><option value="outbound">Исходящие</option><option value="inbound">Входящие</option></select>
          <select name="status" defaultValue={filters.status ?? "all"} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="all">Все статусы</option>{Object.entries(communicationStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <Button type="submit" variant="secondary"><Filter className="size-4" />Применить</Button>
          <Link href="/crm/communications"><Button type="button" variant="ghost">Сбросить</Button></Link>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Журнал сообщений</h2><p className="mt-0.5 text-xs text-[var(--muted)]">Найдено: {messages.length}</p></div></div>
        {messages.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center"><div><Inbox className="mx-auto size-9 text-[var(--brand)]" /><h3 className="mt-4 font-semibold">Сообщений пока нет</h3><p className="mt-1 text-sm text-[var(--muted)]">Создайте первое исходящее сообщение или подключите провайдера.</p></div></div>
        ) : (
          <div className="divide-y">
            {messages.map((message) => {
              const targetHref = message.targetType === "patient" && context.can("patients.read")
                ? `/patients/${message.targetId}`
                : message.targetType === "lead" && context.can("crm.read")
                  ? `/crm/leads/${message.targetId}`
                  : null;
              return (
                <div key={message.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_210px_180px] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">{message.direction === "outbound" ? <ArrowUpRight className="size-4 text-blue-600" /> : <ArrowDownLeft className="size-4 text-violet-600" />}{targetHref ? <Link href={targetHref} className="font-semibold hover:text-[var(--brand)]">{message.targetName}</Link> : <span className="font-semibold">{message.targetName}</span>}<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses[message.status]}`}>{communicationStatusLabels[message.status]}</span></div>
                    {message.subject && <p className="mt-2 text-sm font-medium">{message.subject}</p>}
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{message.body}</p>
                    {message.errorMessage && <p className="mt-2 text-xs text-[var(--danger)]">{message.errorMessage}</p>}
                  </div>
                  <div className="text-sm"><p>{communicationChannelLabels[message.channel]} · {message.recipient}</p><p className="mt-2 text-xs text-[var(--muted)]">Провайдер: {message.provider === "unassigned" ? "не подключён" : message.provider}</p></div>
                  <div className="text-xs text-[var(--muted)]"><p>{dateTime.format(new Date(message.createdAt))}</p><p className="mt-2">{message.creatorName ?? "Внешний отправитель"}</p></div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
