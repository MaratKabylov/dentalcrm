import { notFound } from "next/navigation";

import { BranchDetailManager } from "@/modules/branches/branch-detail-manager";
import { getBranchManagementDetail } from "@/modules/branches/repository";

export default async function BranchSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const detail = await getBranchManagementDetail(id);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-[var(--brand)]">Филиалы</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{detail.branch.name}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Настройки филиала и доступ к его данным.</p>
      </div>
      {saved === "1" && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Филиал сохранён.</div>}
      <BranchDetailManager detail={detail} />
    </div>
  );
}
