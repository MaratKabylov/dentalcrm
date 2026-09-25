import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { LeadForm } from "@/modules/crm/lead-form";
import { listCrmAssignees, listCrmBranches, listMarketingCampaigns, listPatientSources } from "@/modules/crm/repository";
import { requirePermission } from "@/modules/organizations/repository";

export default async function NewLeadPage() {
  await requirePermission("crm.manage");
  const [sources, campaigns, branches, assignees] = await Promise.all([
    listPatientSources(),
    listMarketingCampaigns(),
    listCrmBranches(),
    listCrmAssignees(),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><Link href="/crm/leads" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К реестру лидов</Link><h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Новый лид</h1><p className="mt-2 text-sm text-[var(--muted)]">Зафиксируйте обращение, источник и ответственного сотрудника.</p></div>
      <Card className="p-5 sm:p-7"><LeadForm sources={sources} campaigns={campaigns} branches={branches} assignees={assignees} /></Card>
    </div>
  );
}
