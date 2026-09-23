import Link from "next/link";
import { ArrowLeft, Files } from "lucide-react";

import { ClinicalTemplateManager } from "@/modules/clinical-templates/clinical-template-manager";
import { listClinicalTemplates } from "@/modules/clinical-templates/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function ClinicalTemplatesPage() {
  const [templates, context] = await Promise.all([
    listClinicalTemplates(),
    getOrganizationContext(),
  ]);
  if (!context) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/clinical" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft className="size-4" />К клиническому разделу
      </Link>
      <div className="flex items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Files className="size-6" /></div>
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Настройка лечения</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Клинические шаблоны</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Готовые сценарии для быстрого и единообразного заполнения врачебного приёма.</p>
        </div>
      </div>
      <ClinicalTemplateManager templates={templates} canManage={context.can("settings.manage")} />
    </div>
  );
}
