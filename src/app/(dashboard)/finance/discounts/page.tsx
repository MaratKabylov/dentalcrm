import Link from "next/link";
import { ArrowLeft, BadgePercent } from "lucide-react";

import { DiscountSettings } from "@/modules/finance/discount-settings";
import { listDiscountRoleLimits, listDiscounts } from "@/modules/finance/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function DiscountsPage() {
  const [discounts, roleLimits, context] = await Promise.all([
    listDiscounts(true),
    listDiscountRoleLimits(),
    getOrganizationContext(),
  ]);
  if (!context) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/finance" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К финансовому разделу</Link>
      <div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700"><BadgePercent className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">Финансовые правила</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Скидки и лимиты</h1><p className="mt-2 text-sm text-[var(--muted)]">Управляемый справочник скидок и максимальные полномочия финансовых ролей.</p></div></div>
      <DiscountSettings discounts={discounts} roleLimits={roleLimits} currency={context.organization.currency} canConfigure={context.can("settings.manage")} />
    </div>
  );
}
