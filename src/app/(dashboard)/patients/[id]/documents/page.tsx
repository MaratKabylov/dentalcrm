import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileCheck2 } from "lucide-react";

import { PatientDocumentsPanel } from "@/modules/documents/patient-documents-panel";
import { listDocumentTemplates, listPatientConsents, listPatientDocuments } from "@/modules/documents/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { getPatient } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/schemas";

export default async function PatientDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = patientIdSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const context = await getOrganizationContext();
  if (!context) return null;

  const [patient, templates, documents, consents] = await Promise.all([
    getPatient(parsedId.data),
    listDocumentTemplates(),
    listPatientDocuments(parsedId.data),
    listPatientConsents(parsedId.data),
  ]);
  if (!patient) notFound();
  const patientName = [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href={`/patients/${patient.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К карточке пациента</Link>
      <div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><FileCheck2 className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">{patientName}</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Документы и согласия</h1><p className="mt-2 text-sm text-[var(--muted)]">PDF-снимки, подписи и журнал согласий пациента.</p></div></div>
      <PatientDocumentsPanel patientId={patient.id} patientName={patientName} templates={templates} documents={documents} consents={consents} canManage={context.can("documents.manage")} timeZone={context.organization.timezone} />
    </div>
  );
}
