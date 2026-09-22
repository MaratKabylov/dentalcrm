import { ArrowUpRight, Building2, CheckCircle2, ShieldCheck, UsersRound } from "lucide-react";

import { Card } from "@/components/ui/card";
import { getOrganizationContext } from "@/modules/organizations/repository";

const foundationItems = [
  "Организации и филиалы",
  "Изоляция данных через RLS",
  "Роли и точечные разрешения",
  "Защищённые серверные действия",
];

export default async function DashboardPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Рабочее пространство</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{context.organization.name}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Безопасный фундамент системы готов к подключению операционных модулей.</p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-dark)]">
          <span className="size-1.5 rounded-full bg-[var(--brand)]" />Phase 1 active
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-[var(--muted)]">Организация</p><p className="mt-2 text-xl font-semibold">Активна</p></div><div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-[var(--brand)]"><Building2 className="size-5" /></div></div></Card>
        <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-[var(--muted)]">Ваши роли</p><p className="mt-2 text-xl font-semibold">{context.roles.length}</p></div><div className="grid size-10 place-items-center rounded-xl bg-sky-50 text-sky-700"><UsersRound className="size-5" /></div></div></Card>
        <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-[var(--muted)]">Разрешения</p><p className="mt-2 text-xl font-semibold">{context.permissions.size}</p></div><div className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><ShieldCheck className="size-5" /></div></div></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden">
          <div className="border-b p-5"><h2 className="font-semibold">Фундамент платформы</h2><p className="mt-1 text-sm text-[var(--muted)]">Компоненты, на которых будут строиться следующие модули.</p></div>
          <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2">
            {foundationItems.map((item) => <div key={item} className="flex items-center gap-3 bg-white p-5 text-sm font-medium"><CheckCircle2 className="size-[18px] text-[var(--brand)]" />{item}</div>)}
          </div>
        </Card>
        <Card className="bg-[#123d35] p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Следующий этап</p>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em]">Календарь записей</h2>
          <p className="mt-3 text-sm leading-6 text-emerald-50/70">Реестр пациентов готов. Следующий инкремент Phase 1 — врачи, кабинеты, графики и календарь регистратуры.</p>
          <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-100">Пациенты подключены <ArrowUpRight className="size-4" /></div>
        </Card>
      </div>
    </div>
  );
}
