import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { requirePermission } from "@/modules/organizations/repository";
import { RecallForm } from "@/modules/recalls/recall-form";
import { listRecallDoctors, listRecallPatients } from "@/modules/recalls/repository";
import { recallDefaultsSchema } from "@/modules/recalls/schemas";

export default async function NewRecallPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  await requirePermission("recalls.manage");
  const query = await searchParams;
  const parsedDefaults = recallDefaultsSchema.safeParse(query);
  const requestedPatientId = parsedDefaults.success ? parsedDefaults.data.patientId : undefined;
  const [patients, doctors] = await Promise.all([listRecallPatients(), listRecallDoctors()]);
  const defaultPatientId = patients.some((patient) => patient.id === requestedPatientId)
    ? requestedPatientId
    : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/crm/recalls" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К повторным визитам</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Новый повторный визит</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Запланируйте дату контакта и укажите причину возвращения пациента.</p>
      </div>
      <Card className="p-5 lg:p-7">
        <RecallForm patients={patients} doctors={doctors} defaultPatientId={defaultPatientId} />
      </Card>
    </div>
  );
}
