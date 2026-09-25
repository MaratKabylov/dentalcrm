import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { LeadForm } from "@/modules/crm/lead-form";
import { getLead, getLeadAttribution, listCrmAssignees, listCrmBranches, listMarketingCampaigns, listPatientSources } from "@/modules/crm/repository";
import { requirePermission } from "@/modules/organizations/repository";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("crm.manage");
  const [lead, attribution, sources, campaigns, branches, assignees] = await Promise.all([
    getLead(id), getLeadAttribution(id), listPatientSources(true), listMarketingCampaigns(true), listCrmBranches(), listCrmAssignees(),
  ]);
  if (!lead) notFound();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><Link href={`/crm/leads/${lead.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К карточке лида</Link><h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Изменить лид</h1><p className="mt-2 text-sm text-[var(--muted)]">{lead.fullName}</p></div>
      <Card className="p-5 sm:p-7"><LeadForm lead={lead} attribution={attribution} sources={sources} campaigns={campaigns} branches={branches} assignees={assignees} /></Card>
    </div>
  );
}
