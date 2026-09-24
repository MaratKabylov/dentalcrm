import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CommunicationTemplateManager } from "@/modules/communications/communication-template-manager";
import { listCommunicationTemplates } from "@/modules/communications/repository";
import { requirePermission } from "@/modules/organizations/repository";

export default async function CommunicationTemplatesPage() {
  await requirePermission("communications.manage");
  const templates = await listCommunicationTemplates(true);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div><Link href="/crm/communications" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К коммуникациям</Link><h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Шаблоны сообщений</h1><p className="mt-2 text-sm text-[var(--muted)]">Повторно используемые тексты для ручных сообщений и будущих автоматизаций.</p></div>
      <CommunicationTemplateManager templates={templates} />
    </div>
  );
}
