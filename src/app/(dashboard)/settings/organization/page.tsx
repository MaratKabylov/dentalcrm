import Link from "next/link";
import { BadgeCheck, Globe2, ShieldCheck, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function OrganizationSettingsPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><p className="text-sm font-semibold text-[var(--brand)]">Настройки</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Организация</h1></div>
      <Card className="p-6">
        <div className="flex items-start gap-4"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><BadgeCheck /></div><div><h2 className="text-xl font-semibold">{context.organization.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">Статус: {context.organization.status}</p></div></div>
        <dl className="mt-6 grid gap-4 border-t pt-6 sm:grid-cols-3">
          <div><dt className="text-xs text-[var(--muted)]">Часовой пояс</dt><dd className="mt-1 flex items-center gap-2 text-sm font-medium"><Globe2 className="size-4" />{context.organization.timezone}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Валюта</dt><dd className="mt-1 text-sm font-medium">{context.organization.currency}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Локаль</dt><dd className="mt-1 text-sm font-medium">{context.organization.locale}</dd></div>
        </dl>
      </Card>
      <Card className="p-6"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 text-[var(--brand)]" /><div><h2 className="font-semibold">Ваш доступ</h2><p className="mt-1 text-sm text-[var(--muted)]">{context.roles.map((role) => role.name).join(", ") || "Без назначенной роли"}</p><div className="mt-4 flex flex-wrap gap-2">{[...context.permissions].sort().map((permission) => <span key={permission} className="rounded-lg bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium">{permission}</span>)}</div></div></div></Card>
      {context.can("settings.manage") && <Card className="flex items-center justify-between gap-4 p-6"><div className="flex items-center gap-3"><Stethoscope className="size-5 text-[var(--brand)]" /><div><h2 className="font-semibold">Врачи и графики</h2><p className="mt-1 text-sm text-[var(--muted)]">Настройте врачей, кабинеты и рабочие часы.</p></div></div><Link href="/settings/doctors"><Button variant="secondary">Открыть</Button></Link></Card>}
    </div>
  );
}
