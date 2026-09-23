import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OdontogramEditor } from "@/modules/odontogram/odontogram-editor";
import { getLatestOdontogram } from "@/modules/odontogram/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { getPatient } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/schemas";

export default async function PatientOdontogramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = patientIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [patient, odontogram, context] = await Promise.all([
    getPatient(parsedId.data),
    getLatestOdontogram(parsedId.data),
    getOrganizationContext(),
  ]);
  if (!patient || !context) notFound();

  const patientName = [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href={`/patients/${patient.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft className="size-4" />К карточке пациента
      </Link>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">{patientName} · № {patient.externalNumber}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Одонтограмма</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Последний сохранённый клинический снимок зубов и поверхностей.</p>
        </div>
        {context.can("appointments.manage") && <Link href={`/calendar/new?patient=${patient.id}`}><Button><CalendarPlus className="size-4" />Новая запись</Button></Link>}
      </div>

      <Card className="p-5 lg:p-6">
        <OdontogramEditor
          patientId={patient.id}
          encounterId={null}
          odontogram={odontogram}
          editable={false}
        />
      </Card>
    </div>
  );
}
