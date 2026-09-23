import Link from "next/link";
import { ArrowLeft, Tags } from "lucide-react";

import { Card } from "@/components/ui/card";
import { listPatientSources } from "@/modules/crm/repository";
import { SourceManager } from "@/modules/crm/source-manager";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function SourcesPage() {
  const [sources, context] = await Promise.all([listPatientSources(true), getOrganizationContext()]);
  if (!context) return null;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/crm/leads" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К лидам</Link>
      <div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Tags className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">CRM · атрибуция</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Источники обращений</h1><p className="mt-2 text-sm text-[var(--muted)]">Единый справочник каналов для лидов и будущей маркетинговой аналитики.</p></div></div>
      {context.can("crm.manage") ? <SourceManager sources={sources} /> : <Card className="divide-y">{sources.map((source) => <div key={source.id} className="flex items-center gap-3 p-4"><span className="size-3 rounded-full" style={{ backgroundColor: source.color }} /><span className="text-sm font-medium">{source.name}</span></div>)}</Card>}
    </div>
  );
}
