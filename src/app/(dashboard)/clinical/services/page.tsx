import Link from "next/link";
import { ArrowLeft, BookOpenText } from "lucide-react";

import { ServiceCatalogManager } from "@/modules/services/service-catalog-manager";
import { getServiceCatalog } from "@/modules/services/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function ServicesPage() {
  const [catalog, context] = await Promise.all([
    getServiceCatalog(true),
    getOrganizationContext(),
  ]);
  if (!context) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/clinical" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К клиническому разделу</Link>
      <div className="flex items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><BookOpenText className="size-6" /></div>
        <div><p className="text-sm font-semibold text-[var(--brand)]">Настройка лечения</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Каталог услуг</h1><p className="mt-2 text-sm text-[var(--muted)]">Категории, нормативная длительность и базовые цены клиники.</p></div>
      </div>
      <ServiceCatalogManager categories={catalog.categories} services={catalog.services} canManageGlobal={context.can("directories.manage_global")} canManageBranch={context.can("directories.manage_branch")} branches={context.branches.filter((branch) => branch.isActive)} currency={context.organization.currency} />
    </div>
  );
}
