import { Bell, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { signOut } from "@/modules/auth/actions";
import type { OrganizationMembership } from "@/modules/organizations/types";

type DashboardHeaderProps = {
  activeOrganizationId: string;
  memberships: OrganizationMembership[];
  userEmail: string;
};

export function DashboardHeader({ activeOrganizationId, memberships, userEmail }: DashboardHeaderProps) {
  const active = memberships.find((item) => item.organization.id === activeOrganizationId)!;
  const initials = userEmail.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b bg-white/90 px-5 backdrop-blur-xl lg:px-8">
      <div className="relative hidden max-w-xl flex-1 md:block">
        <Search className="absolute left-3.5 top-2.5 size-4 text-[var(--muted)]" />
        <div className="flex h-9 items-center rounded-xl border bg-[var(--background)] pl-10 pr-2 text-sm text-[var(--muted)]">
          Глобальный поиск
          <kbd className="ml-auto rounded-md border bg-white px-1.5 py-0.5 text-[10px]">⌘ K</kbd>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {memberships.length > 1 ? (
          <OrganizationSwitcher
            activeOrganizationId={activeOrganizationId}
            memberships={memberships}
          />
        ) : (
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold">{active.organization.name}</p>
            <p className="text-[11px] text-[var(--muted)]">{active.roles[0]?.name ?? "Сотрудник"}</p>
          </div>
        )}
        <Button variant="ghost" className="size-9 px-0" aria-label="Уведомления"><Bell className="size-[18px]" /></Button>
        <details className="relative">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-full bg-[#173f37] text-xs font-bold text-white">{initials}</summary>
          <div className="absolute right-0 mt-2 w-60 rounded-xl border bg-white p-2 shadow-xl">
            <p className="truncate px-3 py-2 text-xs text-[var(--muted)]">{userEmail}</p>
            <form action={signOut}><Button variant="ghost" className="w-full justify-start">Выйти</Button></form>
          </div>
        </details>
      </div>
    </header>
  );
}
