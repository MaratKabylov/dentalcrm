import Link from "next/link";
import { ArrowUpRight, BarChart3, Boxes, CalendarDays, CircleDollarSign, Megaphone, Stethoscope, UsersRound } from "lucide-react";

import { Card } from "@/components/ui/card";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function DashboardPage() {
  const context = await getOrganizationContext();
  if (!context) return null;
  const modules = [
    { permission: "appointments.read", href: "/calendar", title: "Календарь", text: "Записи и загрузка врачей", icon: CalendarDays },
    { permission: "patients.read", href: "/patients", title: "Пациенты", text: "Карточки и история лечения", icon: UsersRound },
    { permission: "clinical.read", href: "/clinical", title: "Лечение", text: "Приёмы и планы лечения", icon: Stethoscope },
    { permission: "crm.read", href: "/crm", title: "CRM", text: "Лиды и коммуникации", icon: Megaphone },
    { permission: "finance.read", href: "/finance", title: "Финансы", text: "Счета, оплаты и долги", icon: CircleDollarSign },
    { permission: "inventory.read", href: "/inventory", title: "Склад", text: "Остатки и материалы", icon: Boxes },
  ].filter((item) => context.permissions.has(item.permission));
  return <div className="mx-auto max-w-7xl space-y-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-[var(--brand)]">Рабочее пространство</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{context.organization.name}</h1><p className="mt-2 text-sm text-[var(--muted)]">Единый контур клиники: от записи пациента до управленческого отчёта.</p></div><div className="inline-flex items-center gap-2 self-start rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-dark)]"><span className="size-1.5 rounded-full bg-[var(--brand)]" />Phase 7 active</div></div>
    {context.can("reports.read") && <Link href="/analytics" className="group block rounded-2xl bg-[#123d35] p-6 text-white"><div className="flex items-start justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Управленческий центр</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">Аналитика клиники</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/70">Выручка, оплаты, загрузка врачей, конверсия регистратуры, источники пациентов и расход материалов.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-100">Открыть дашборд <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5" /></span></div><BarChart3 className="size-8 text-emerald-200" /></div></Link>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{modules.map(({ href, title, text, icon: Icon }) => <Link key={href} href={href}><Card className="h-full p-5 transition hover:border-[var(--brand)]"><Icon className="size-6 text-[var(--brand)]" /><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{text}</p></Card></Link>)}</div>
  </div>;
}
