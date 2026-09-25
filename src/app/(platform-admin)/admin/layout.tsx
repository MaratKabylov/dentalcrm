import Link from "next/link";

import { BrandMark } from "@/components/shared/brand-mark";
import { Button } from "@/components/ui/button";
import { signOut } from "@/modules/auth/actions";
import { requireUser } from "@/modules/auth/repository";
import { requireSuperAdmin } from "@/modules/platform-admin/repository";

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center gap-5 px-5 lg:px-8">
          <Link href="/admin/organizations"><BrandMark /></Link>
          <span className="hidden rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-dark)] sm:inline-flex">Супер-администратор</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-[var(--muted)] md:inline">{user.email}</span>
            <Link href="/dashboard" className="text-sm font-semibold text-[var(--brand-dark)]">В рабочее пространство</Link>
            <form action={signOut}><Button variant="secondary">Выйти</Button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8 lg:py-9">{children}</main>
    </div>
  );
}
