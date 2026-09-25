"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Stethoscope, UsersRound } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/settings/organization", label: "Клиника", icon: Building2, permission: "organization" },
  { href: "/settings/users", label: "Пользователи", icon: UsersRound, permission: "users" },
  { href: "/settings/doctors", label: "Врачи и графики", icon: Stethoscope, permission: "settings" },
] as const;

export function SettingsNav({ canManageUsers, canManageSettings }: { canManageUsers: boolean; canManageSettings: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Разделы настроек" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border bg-white p-1.5 shadow-[0_1px_2px_rgba(23,52,46,0.04)]">
      {items.map((item) => {
        if (item.permission === "users" && !canManageUsers) return null;
        if (item.permission === "settings" && !canManageSettings) return null;
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition",
              active ? "bg-[var(--brand-soft)] text-[var(--brand-dark)]" : "text-[var(--muted)] hover:bg-[var(--surface-muted)]",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

