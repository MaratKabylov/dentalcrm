"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  LayoutDashboard,
  Settings2,
  Stethoscope,
  UsersRound,
} from "lucide-react";

import { BrandMark } from "@/components/shared/brand-mark";

const navItems = [
  { label: "Обзор", href: "/dashboard", icon: LayoutDashboard, enabled: true },
  { label: "Календарь", href: "/calendar", icon: CalendarDays, enabled: false },
  { label: "Пациенты", href: "/patients", icon: UsersRound, enabled: true },
  { label: "Лечение", href: "/clinical", icon: Stethoscope, enabled: false },
  { label: "Финансы", href: "/finance", icon: CircleDollarSign, enabled: false },
  { label: "Склад", href: "/inventory", icon: Boxes, enabled: false },
  { label: "Аналитика", href: "/analytics", icon: BarChart3, enabled: false },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-white px-4 py-5 lg:flex">
      <div className="px-2"><BrandMark /></div>
      <nav className="mt-9 flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
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
        <span className="font-semibold text-[var(--foreground)]">Phase 1</span><br />Пациенты и календарь
      </div>
    </aside>
  );
}
