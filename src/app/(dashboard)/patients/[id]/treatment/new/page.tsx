import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { getOrganizationContext, requirePermission } from "@/modules/organizations/repository";
import { getPatient } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/schemas";
import { listDoctors } from "@/modules/scheduling/repository";
import { getServiceCatalog } from "@/modules/services/repository";
import { TreatmentPlanEditor } from "@/modules/treatment-plans/treatment-plan-editor";

export default async function NewTreatmentPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("treatment_plan.manage");
  const { id } = await params;
  const parsedId = patientIdSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const [patient, doctors, catalog, context] = await Promise.all([
    getPatient(parsedId.data),
    listDoctors(),
    getServiceCatalog(),
    getOrganizationContext(),
  ]);
  if (!patient || !context) notFound();
  const patientName = [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={`/patients/${patient.id}/treatment`} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К планам лечения</Link>
      <div><p className="text-sm font-semibold text-[var(--brand)]">{patientName}</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Новый план лечения</h1></div>
      <Card className="p-5 lg:p-6"><TreatmentPlanEditor patientId={patient.id} plan={null} doctors={doctors} services={catalog.services} currency={context.organization.currency} /></Card>
    </div>
  );
}
