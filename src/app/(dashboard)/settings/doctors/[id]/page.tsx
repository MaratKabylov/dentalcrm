import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { DoctorDetailManager } from "@/modules/scheduling/doctor-detail-manager";
import { getDoctorManagementDetail } from "@/modules/scheduling/repository";

export default async function DoctorSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getDoctorManagementDetail(id);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/settings/doctors" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К списку врачей</Link>
        <div className="mt-4 flex items-center gap-3"><span className="size-4 rounded-full" style={{ backgroundColor: detail.color }} /><div><h1 className="text-3xl font-semibold tracking-[-0.04em]">{detail.fullName}</h1><p className="mt-1 text-sm text-[var(--brand)]">{detail.specializationName}</p></div></div>
      </div>
      <DoctorDetailManager detail={detail} />
    </div>
  );
}
