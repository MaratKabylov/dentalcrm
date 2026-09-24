import Link from "next/link";
import { ArrowLeft, Building2, ClipboardPlus, Mail, MessageSquareText, Pencil, Phone, UserRound } from "lucide-react";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LeadActions } from "@/modules/crm/lead-actions";
import { leadActivityLabels, leadStatusLabels } from "@/modules/crm/constants";
import { getLead, listLeadActivities } from "@/modules/crm/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lead, activities, context] = await Promise.all([getLead(id), listLeadActivities(id), getOrganizationContext()]);
  if (!lead) notFound();
  if (!context) return null;
  const dateTime = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: context.organization.timezone });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><Link href="/crm/leads" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К реестру лидов</Link><div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-[-0.04em]">{lead.fullName}</h1><span className="rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-dark)]">{leadStatusLabels[lead.status]}</span></div><p className="mt-2 text-sm text-[var(--muted)]">Создан {dateTime.format(new Date(lead.createdAt))}</p></div>
        <div className="flex flex-wrap gap-2">
          {context.can("tasks.manage") && <Link href={`/crm/tasks/new?leadId=${lead.id}`}><Button><ClipboardPlus className="size-4" />Создать задачу</Button></Link>}
          {context.can("crm.manage") && <Link href={`/crm/leads/${lead.id}/edit`}><Button variant="secondary"><Pencil className="size-4" />Изменить</Button></Link>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-5"><div className="grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3"><Phone className="mt-0.5 size-4 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Телефон</p><a href={`tel:${lead.phone}`} className="mt-1 block text-sm font-medium hover:text-[var(--brand)]">{lead.phone}</a></div></div>
            <div className="flex gap-3"><Mail className="mt-0.5 size-4 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Email</p><p className="mt-1 text-sm font-medium">{lead.email ?? "Не указан"}</p></div></div>
            <div className="flex gap-3"><UserRound className="mt-0.5 size-4 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Ответственный</p><p className="mt-1 text-sm font-medium">{lead.assigneeName ?? "Не назначен"}</p></div></div>
            <div className="flex gap-3"><Building2 className="mt-0.5 size-4 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Филиал</p><p className="mt-1 text-sm font-medium">{lead.branchName ?? "Не выбран"}</p></div></div>
          </div><div className="mt-5 border-t pt-5"><p className="text-xs text-[var(--muted)]">Источник</p><div className="mt-2 flex items-center gap-2 text-sm font-medium"><span className="size-3 rounded-full" style={{ backgroundColor: lead.sourceColor }} />{lead.sourceName}</div>{lead.notes && <><p className="mt-5 text-xs text-[var(--muted)]">Комментарий</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{lead.notes}</p></>}</div></Card>

          <Card className="overflow-hidden"><div className="flex items-center gap-2 border-b px-5 py-4"><MessageSquareText className="size-5 text-[var(--brand)]" /><h2 className="font-semibold">История активности</h2></div>{activities.length === 0 ? <div className="p-8 text-center text-sm text-[var(--muted)]">Активностей пока нет.</div> : <div className="divide-y">{activities.map((activity) => <div key={activity.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold">{leadActivityLabels[activity.type]}</span><span className="text-xs text-[var(--muted)]">{dateTime.format(new Date(activity.createdAt))}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{activity.type === "status_change" ? activity.body.split(" → ").map((status) => leadStatusLabels[status as keyof typeof leadStatusLabels] ?? status).join(" → ") : activity.body}</p><p className="mt-2 text-xs text-[var(--muted)]">{activity.employeeName}</p></div>)}</div>}</Card>
        </div>
        {context.can("crm.manage") && <Card className="h-fit p-5"><LeadActions lead={lead} /></Card>}
      </div>
    </div>
  );
}
