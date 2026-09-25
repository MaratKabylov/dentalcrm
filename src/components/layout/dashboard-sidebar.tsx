"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CalendarDays,
  CalendarClock,
  ClipboardCheck,
  CircleDollarSign,
  FileCheck2,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  BellRing,
  Settings2,
  Stethoscope,
  Target,
  UsersRound,
} from "lucide-react";

import { BrandMark } from "@/components/shared/brand-mark";

const navItems = [
  { label: "Обзор", href: "/dashboard", icon: LayoutDashboard, enabled: true },
  { label: "Календарь", href: "/calendar", icon: CalendarDays, enabled: true },
  { label: "Пациенты", href: "/patients", icon: UsersRound, enabled: true },
  { label: "CRM", href: "/crm", icon: Megaphone, enabled: true },
  { label: "Маркетинг", href: "/crm/marketing", icon: Target, enabled: true },
  { label: "Задачи", href: "/crm/tasks", icon: ClipboardCheck, enabled: true },
  { label: "Повторные визиты", href: "/crm/recalls", icon: CalendarClock, enabled: true },
  { label: "Коммуникации", href: "/crm/communications", icon: MessagesSquare, enabled: true },
  { label: "Напоминания", href: "/crm/reminders", icon: BellRing, enabled: true },
  { label: "Лечение", href: "/clinical", icon: Stethoscope, enabled: true },
  { label: "Документы", href: "/documents", icon: FileCheck2, enabled: true },
  { label: "Финансы", href: "/finance", icon: CircleDollarSign, enabled: true },
  { label: "Склад", href: "/inventory", icon: Boxes, enabled: false },
  { label: "Аналитика", href: "/analytics", icon: BarChart3, enabled: false },
];

export function DashboardSidebar({
  canReadClinical,
  canReadFinance,
  canReadCrm,
  canReadTasks,
  canReadRecalls,
  canReadCommunications,
  canReadAutomation,
  canReadDocuments,
}: {
  canReadClinical: boolean;
  canReadFinance: boolean;
  canReadCrm: boolean;
  canReadTasks: boolean;
  canReadRecalls: boolean;
  canReadCommunications: boolean;
  canReadAutomation: boolean;
  canReadDocuments: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-white px-4 py-5 lg:flex">
      <div className="px-2"><BrandMark /></div>
      <nav className="mt-9 flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          if (item.href === "/clinical" && !canReadClinical) return null;
          if (item.href === "/finance" && !canReadFinance) return null;
          if (item.href === "/crm" && !canReadCrm) return null;
          if (item.href === "/crm/marketing" && !canReadCrm) return null;
          if (item.href === "/crm/tasks" && !canReadTasks) return null;
          if (item.href === "/crm/recalls" && !canReadRecalls) return null;
          if (item.href === "/crm/communications" && !canReadCommunications) return null;
          if (item.href === "/crm/reminders" && !canReadAutomation) return null;
          if (item.href === "/documents" && !canReadDocuments) return null;
          if (!item.enabled) {
            return (
              <div key={item.href} className="flex h-10 cursor-not-allowed items-center gap-3 rounded-xl px-3 text-sm text-[#9aaca7]">
                <Icon className="size-[18px]" />
                <span>{item.label}</span>
                <span className="ml-auto rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">скоро</span>
              </div>
            );
          }
          const isActive = item.href === "/dashboard"
            ? pathname === item.href
            : item.href === "/crm"
              ? pathname === "/crm" || pathname.startsWith("/crm/leads") || pathname.startsWith("/crm/sources")
              : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={isActive ? "flex h-10 items-center gap-3 rounded-xl bg-[var(--brand-soft)] px-3 text-sm font-semibold text-[var(--brand-dark)]" : "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)]"}>
              <Icon className="size-[18px]" />{item.label}
            </Link>
          );
        })}
      </nav>
      <Link href="/settings/organization" className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)]">
        <Settings2 className="size-[18px]" />Настройки
      </Link>
      <div className="mt-4 rounded-xl bg-[var(--surface-muted)] px-3 py-3 text-xs leading-5 text-[var(--muted)]">
        <span className="font-semibold text-[var(--foreground)]">Phase 5</span><br />Документы и согласия
      </div>
    </aside>
  );
}
