import Link from "next/link";
import { ChevronRight, Filter, MessageSquareText, Plus, Search, Settings2, UserRoundSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { leadStatusLabels, leadStatusOptions } from "@/modules/crm/constants";
import { listCrmBranches, listLeads, listPatientSources } from "@/modules/crm/repository";
import { leadFiltersSchema } from "@/modules/crm/schemas";
import type { LeadStatus } from "@/modules/crm/types";
import { getOrganizationContext } from "@/modules/organizations/repository";

const statusClasses: Record<LeadStatus, string> = {
  new: "bg-sky-50 text-sky-800",
  contacted: "bg-violet-50 text-violet-800",
  appointment_booked: "bg-emerald-50 text-emerald-800",
  thinking: "bg-amber-50 text-amber-800",
  lost: "bg-rose-50 text-rose-800",
  converted: "bg-teal-100 text-teal-900",
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string; branch?: string }>;
}) {
  const query = await searchParams;
  const parsed = leadFiltersSchema.safeParse(query);
  const filters = parsed.success ? parsed.data : { q: "", status: "all" as const };
  const [leads, sources, branches, context] = await Promise.all([
    listLeads(filters),
    listPatientSources(),
    listCrmBranches(),
    getOrganizationContext(),
  ]);
  if (!context) return null;
  const dateTime = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: context.organization.timezone });
  const statusCounts = leads.reduce<Record<string, number>>((counts, lead) => {
    counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-[var(--brand)]">CRM · воронка обращений</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Лиды</h1><p className="mt-2 text-sm text-[var(--muted)]">Все обращения до создания полноценной карточки пациента.</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/crm/sources"><Button variant="secondary"><Settings2 className="size-4" />Источники</Button></Link>
          {context.can("crm.manage") && <Link href="/crm/leads/new"><Button><Plus className="size-4" />Новый лид</Button></Link>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {leadStatusOptions.map((status) => <Card key={status.value} className="p-4"><p className="text-xs text-[var(--muted)]">{status.label}</p><p className="mt-2 text-2xl font-semibold">{statusCounts[status.value] ?? 0}</p></Card>)}
      </div>

      <Card className="p-4">
        <form action="/crm/leads" className="grid gap-3 lg:grid-cols-[1fr_190px_190px_190px_auto_auto]">
          <div className="relative"><Search className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" /><Input name="q" defaultValue={filters.q} className="pl-10" placeholder="Имя, телефон или email" aria-label="Поиск лидов" /></div>
          <select name="status" defaultValue={filters.status ?? "all"} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="all">Все статусы</option>{leadStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
          <select name="source" defaultValue={filters.source ?? ""} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="">Все источники</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
          <select name="branch" defaultValue={filters.branch ?? ""} className="h-11 rounded-xl border bg-white px-3.5 text-sm"><option value="">Все филиалы</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <Button type="submit" variant="secondary"><Filter className="size-4" />Применить</Button>
          <Link href="/crm/leads"><Button type="button" variant="ghost">Сбросить</Button></Link>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Реестр лидов</h2><p className="mt-0.5 text-xs text-[var(--muted)]">Найдено: {leads.length}</p></div></div>
        {leads.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><UserRoundSearch className="size-6" /></div><h3 className="mt-4 font-semibold">Лиды не найдены</h3><p className="mt-1 text-sm text-[var(--muted)]">Измените фильтры или создайте первое обращение.</p></div></div>
        ) : (
          <div className="divide-y">
            {leads.map((lead) => (
              <Link key={lead.id} href={`/crm/leads/${lead.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-[var(--surface-muted)] lg:grid-cols-[1fr_180px_180px_150px_24px] lg:items-center">
                <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{lead.fullName}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses[lead.status]}`}>{leadStatusLabels[lead.status]}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{lead.phone}{lead.email ? ` · ${lead.email}` : ""}</p></div>
                <div className="flex items-center gap-2 text-sm"><span className="size-2.5 rounded-full" style={{ backgroundColor: lead.sourceColor }} /><span>{lead.sourceName}</span></div>
                <div className="text-sm"><p>{lead.assigneeName ?? "Не назначен"}</p><p className="mt-1 text-xs text-[var(--muted)]">{lead.branchName ?? "Без филиала"}</p></div>
                <div className="text-xs text-[var(--muted)]"><p className="flex items-center gap-1.5"><MessageSquareText className="size-3.5" />{lead.activityCount} событий</p><p className="mt-1">{dateTime.format(new Date(lead.updatedAt))}</p></div>
                <ChevronRight className="size-4 text-[var(--muted)]" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
