import Link from "next/link";
import { Building2, DoorOpen, MapPin, Plus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listBranchesForManagement } from "@/modules/branches/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function BranchesSettingsPage() {
  const [branches, context] = await Promise.all([
    listBranchesForManagement(),
    getOrganizationContext(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Настройки</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Филиалы</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Адреса, часы работы, кабинеты и доступ сотрудников к данным.
          </p>
        </div>
        {context?.hasAllBranchAccess && (
          <Link href="/settings/branches/new">
            <Button><Plus className="size-4" />Добавить филиал</Button>
          </Link>
        )}
      </div>

      {branches.length === 0 ? (
        <Card className="grid min-h-64 place-items-center p-8 text-center">
          <div>
            <Building2 className="mx-auto size-8 text-[var(--brand)]" />
            <h2 className="mt-4 font-semibold">Нет доступных филиалов</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Попросите владельца или администратора выдать вам доступ.</p>
          </div>
        </Card>
      ) : <div className="grid gap-4 md:grid-cols-2">
        {branches.map((branch) => (
          <Link key={branch.id} href={`/settings/branches/${branch.id}`} className="group">
            <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-[var(--brand)] group-hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{branch.name}</h2>
                    <p className="mt-1 flex items-start gap-1.5 text-sm text-[var(--muted)]">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      {branch.address || "Адрес не указан"}
                    </p>
                  </div>
                </div>
                <span className={branch.isActive ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"}>
                  {branch.isActive ? "Активен" : "Архив"}
                </span>
              </div>
              <div className="mt-5 flex gap-5 border-t pt-4 text-sm text-[var(--muted)]">
                <span className="flex items-center gap-1.5"><DoorOpen className="size-4" />{branch.roomsCount} кабинетов</span>
                <span className="flex items-center gap-1.5"><UsersRound className="size-4" />{branch.employeesCount} сотрудников</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>}
    </div>
  );
}
