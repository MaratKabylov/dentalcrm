import Link from "next/link";
import { CalendarClock, Mail, ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/shared/brand-mark";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/modules/auth/repository";
import { AcceptInvitationForm } from "@/modules/users/accept-invitation-form";
import { getInvitationSummary } from "@/modules/users/repository";
import { invitationTokenSchema } from "@/modules/users/schemas";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsedToken = invitationTokenSchema.safeParse(token);
  const invitation = parsedToken.success ? await getInvitationSummary(token) : null;
  const user = await getCurrentUser();
  const active = invitation?.status === "pending";
  const emailMatches = !!user?.email && invitation?.email.toLowerCase() === user.email.toLowerCase();
  const nextPath = `/invite/${token}`;
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(invitation?.email ?? "")}`;
  const registerHref = `/register?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(invitation?.email ?? "")}`;

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-7 flex justify-center"><BrandMark /></div>
        <Card className="p-6 sm:p-8">
          {!invitation ? <div className="text-center"><h1 className="text-2xl font-semibold">Приглашение не найдено</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Проверьте ссылку или попросите администратора создать новую.</p></div> : !active ? <div className="text-center"><h1 className="text-2xl font-semibold">Приглашение недоступно</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Оно уже принято, отменено или срок его действия истёк.</p></div> : <>
            <div className="text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><ShieldCheck /></div><p className="mt-5 text-sm font-semibold text-[var(--brand)]">Приглашение в клинику</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{invitation.organizationName}</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Вам назначена роль «{invitation.roleName}».</p></div>
            <div className="mt-6 space-y-3 rounded-xl bg-[var(--surface-muted)] p-4 text-sm"><p className="flex items-center gap-2"><Mail className="size-4 text-[var(--brand)]" />{invitation.email}</p><p className="flex items-center gap-2"><CalendarClock className="size-4 text-[var(--brand)]" />Действует до {new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(invitation.expiresAt))}</p></div>
            {!user ? <div className="mt-6 grid gap-3 sm:grid-cols-2"><Link href={loginHref} className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">Войти</Link><Link href={registerHref} className="inline-flex h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-semibold hover:bg-[var(--surface-muted)]">Создать аккаунт</Link></div> : !emailMatches ? <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">Вы вошли как <strong>{user.email}</strong>, а приглашение создано для <strong>{invitation.email}</strong>. Войдите под нужной учётной записью.</div> : <AcceptInvitationForm token={token} />}
          </>}
        </Card>
      </div>
    </main>
  );
}

