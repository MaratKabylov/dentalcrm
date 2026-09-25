import Link from "next/link";
import { ArrowLeft, Files } from "lucide-react";

import { DocumentTemplateManager } from "@/modules/documents/document-template-manager";
import { listDocumentTemplates } from "@/modules/documents/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function DocumentTemplatesPage() {
  const context = await getOrganizationContext();
  if (!context) return null;
  const templates = await listDocumentTemplates(context.can("documents.manage"));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/documents" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К документам</Link>
      <div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Files className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">Настройка документов</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Шаблоны документов</h1><p className="mt-2 text-sm text-[var(--muted)]">Версионные формы для договоров, согласий, рекомендаций, справок и назначений.</p></div></div>
      <DocumentTemplateManager templates={templates} canManage={context.can("documents.manage")} />
    </div>
  );
}
