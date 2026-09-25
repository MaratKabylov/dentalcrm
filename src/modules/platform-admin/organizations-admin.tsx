"use client";

import { useMemo, useState } from "react";
import { Building2, ChevronDown, Clock3, Search, ShieldAlert, UsersRound } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OrganizationAccessForm } from "@/modules/platform-admin/organization-access-form";
import type { PlatformAdminAuditLog, PlatformOrganization } from "@/modules/platform-admin/types";

const stateLabels = {
  active: "Активна",
  expired: "Срок истёк",
  suspended: "Заблокирована",
  archived: "В архиве",
} as const;

const stateStyles = {
  active: "bg-emerald-50 text-emerald-700",
  expired: "bg-amber-50 text-amber-800",
  suspended: "bg-red-50 text-red-700",
  archived: "bg-slate-100 text-slate-600",
} as const;

const auditLabels = {
  "access.updated": "изменил срок доступа",
  "access.suspended": "перевёл в режим чтения",
  "access.restored": "восстановил полный доступ",
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value: string | null) {
  if (!value) return "Нет активности";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function OrganizationsAdmin({
  organizations,
  auditLogs,
  today,
  expiringThrough,
}: {
  organizations: PlatformOrganization[];
  auditLogs: PlatformAdminAuditLog[];
  today: string;
  expiringThrough: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");

  const expiringCount = organizations.filter((item) => item.accessState === "active" && item.accessUntil >= today && item.accessUntil <= expiringThrough).length;
  const filtered = useMemo(() => organizations.filter((item) => {
    const matchesQuery = !normalizedQuery || [item.name, item.legalName, item.bin, item.ownerName, item.ownerEmail]
      .some((value) => value?.toLocaleLowerCase("ru").includes(normalizedQuery));
    const matchesFilter = filter === "all"
      || item.accessState === filter
      || (filter === "expiring" && item.accessState === "active" && item.accessUntil >= today && item.accessUntil <= expiringThrough);
    return matchesQuery && matchesFilter;
  }), [expiringThrough, filter, normalizedQuery, organizations, today]);

  const stats = [
    { label: "Всего организаций", value: organizations.length, icon: Building2, tone: "text-[var(--brand)] bg-[var(--brand-soft)]" },
    { label: "Полный доступ", value: organizations.filter((item) => item.accessState === "active").length, icon: UsersRound, tone: "text-emerald-700 bg-emerald-50" },
    { label: "Истекает за 14 дней", value: expiringCount, icon: Clock3, tone: "text-amber-700 bg-amber-50" },
    { label: "Только чтение", value: organizations.filter((item) => item.accessState === "expired" || item.accessState === "suspended").length, icon: ShieldAlert, tone: "text-red-700 bg-red-50" },
  ];

  return (
    <div className="space-y-7">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="p-5">
            <div className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></div>
            <p className="mt-4 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{label}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <label className="relative block flex-1">
            <span className="sr-only">Поиск организаций</span>
            <Search className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Организация, БИН, владелец или email" className="pl-10" />
          </label>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-11 rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="all">Все состояния</option>
            <option value="active">Активные</option>
            <option value="expiring">Скоро истекают</option>
            <option value="expired">Срок истёк</option>
            <option value="suspended">Заблокированные</option>
            <option value="archived">Архивные</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--muted)]">Организации не найдены.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((organization) => (
              <details key={organization.id} className="group">
                <summary className="grid cursor-pointer list-none gap-4 p-5 hover:bg-[var(--surface-muted)]/45 lg:grid-cols-[minmax(220px,1.5fr)_minmax(180px,1fr)_120px_145px_150px_24px] lg:items-center">
                  <div>
                    <p className="font-semibold">{organization.name}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{organization.bin ? `БИН ${organization.bin}` : organization.legalName ?? "Юридические данные не заполнены"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{organization.ownerName || "Владелец не указан"}</p>
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">{organization.ownerEmail || "Нет email"}</p>
                  </div>
                  <div className="text-sm"><span className="font-semibold">{organization.memberCount}</span><span className="ml-1 text-xs text-[var(--muted)]">сотрудн.</span></div>
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stateStyles[organization.accessState]}`}>{stateLabels[organization.accessState]}</span>
                    {organization.suspensionReason && <p className="mt-1 max-w-40 truncate text-xs text-[var(--muted)]">{organization.suspensionReason}</p>}
                  </div>
                  <div>
                    <p className="text-sm font-medium">до {formatDate(organization.accessUntil)}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{formatDateTime(organization.lastActivityAt)}</p>
                  </div>
                  <ChevronDown className="size-4 text-[var(--muted)] transition group-open:rotate-180" />
                </summary>
                {organization.accessState === "archived" ? (
                  <div className="border-t bg-[var(--surface-muted)]/55 p-5 text-sm text-[var(--muted)]">Доступ архивной организации нельзя изменить.</div>
                ) : (
                  <OrganizationAccessForm organization={organization} />
                )}
              </details>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div>
          <h2 className="text-lg font-semibold">Журнал действий</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Последние изменения доступа к организациям.</p>
        </div>
        <div className="mt-5 divide-y">
          {auditLogs.length === 0 ? (
            <p className="py-6 text-sm text-[var(--muted)]">Изменений пока нет.</p>
          ) : auditLogs.map((log) => (
            <div key={log.id} className="flex flex-col gap-1 py-4 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-5">
              <div>
                <p><span className="font-semibold">{log.actorName || log.actorEmail || "Администратор"}</span> {auditLabels[log.action]} для <span className="font-semibold">{log.organizationName}</span></p>
                {log.reason && <p className="mt-1 text-xs text-[var(--muted)]">Причина: {log.reason}</p>}
              </div>
              <time className="shrink-0 text-xs text-[var(--muted)]">{formatDateTime(log.occurredAt)}</time>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
