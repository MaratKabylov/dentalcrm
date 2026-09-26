import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { BranchForm } from "@/modules/branches/branch-form";
import { requirePermission } from "@/modules/organizations/repository";

export default async function NewBranchPage() {
  const context = await requirePermission("branches.manage");
  if (!context.hasAllBranchAccess) redirect("/settings/branches");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-[var(--brand)]">Филиалы</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Новый филиал</h1>
      </div>
      <Card className="p-5 sm:p-7">
        <div className="mb-6 flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Building2 className="size-5" /></div>
          <div><h2 className="font-semibold">Основные данные</h2><p className="mt-1 text-sm text-[var(--muted)]">После создания можно настроить график, кабинеты и доступ.</p></div>
        </div>
        <BranchForm />
      </Card>
    </div>
  );
}
