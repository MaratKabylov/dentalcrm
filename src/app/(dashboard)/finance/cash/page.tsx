import Link from "next/link";
import { ArrowLeft, Banknote } from "lucide-react";

import { CashDeskManager } from "@/modules/finance/cash-desk-manager";
import { listCashDesks } from "@/modules/finance/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function CashDesksPage() {
  const [cashDesks, context] = await Promise.all([listCashDesks(), getOrganizationContext()]);
  if (!context) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/finance" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К финансовому разделу</Link>
      <div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Banknote className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">Кассовый контур</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Кассы и смены</h1><p className="mt-2 text-sm text-[var(--muted)]">Открытие смены, наличный остаток и сверка при закрытии.</p></div></div>
      <CashDeskManager cashDesks={cashDesks} currency={context.organization.currency} timeZone={context.organization.timezone} canManage={context.can("cashdesk.manage")} />
    </div>
  );
}
