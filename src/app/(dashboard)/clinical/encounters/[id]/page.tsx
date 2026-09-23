import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, CircleUserRound, MapPin, Stethoscope } from "lucide-react";

import { Card } from "@/components/ui/card";
import { AttachmentsPanel } from "@/modules/attachments/attachments-panel";
import { listPatientAttachments } from "@/modules/attachments/repository";
import { listClinicalTemplates } from "@/modules/clinical-templates/repository";
import { EncounterForm } from "@/modules/clinical/encounter-form";
import { getClinicalEncounter } from "@/modules/clinical/repository";
import { clinicalEncounterIdSchema } from "@/modules/clinical/schemas";
import { DiagnosisPanel } from "@/modules/diagnoses/diagnosis-panel";
import { listDiagnosisOptions, listEncounterDiagnoses } from "@/modules/diagnoses/repository";
import { OdontogramEditor } from "@/modules/odontogram/odontogram-editor";
import { getLatestOdontogram } from "@/modules/odontogram/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { PerformedServicesPanel } from "@/modules/performed-services/performed-services-panel";
import {
  listAvailablePlanItemsForEncounter,
  listEncounterPerformedServices,
} from "@/modules/performed-services/repository";
import { getServiceCatalog } from "@/modules/services/repository";

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function ClinicalField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{value || "Не указано"}</p>
    </div>
  );
}

export default async function ClinicalEncounterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ closed?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const parsedId = clinicalEncounterIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [encounter, context] = await Promise.all([
    getClinicalEncounter(parsedId.data),
    getOrganizationContext(),
  ]);
  if (!encounter || !context) notFound();

  const canEdit = encounter.status === "open" && context.can("clinical.write");
  const [
    odontogram,
    diagnoses,
    diagnosisOptions,
    performedServices,
    availablePlanItems,
    serviceCatalog,
    clinicalTemplates,
    attachments,
  ] = await Promise.all([
    getLatestOdontogram(encounter.patientId),
    listEncounterDiagnoses(encounter.id),
    listDiagnosisOptions(),
    listEncounterPerformedServices(encounter.id),
    listAvailablePlanItemsForEncounter(encounter.id),
    getServiceCatalog(),
    listClinicalTemplates(),
    listPatientAttachments(encounter.patientId, encounter.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/clinical" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft className="size-4" />К журналу приёмов
      </Link>

      {query.closed === "1" && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="size-4" />Приём завершён, запись календаря отмечена выполненной.
        </div>
      )}

      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="flex items-start gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Stethoscope className="size-7" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-[-0.04em]">Врачебный приём</h1>
              <span className={encounter.status === "open" ? "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800" : "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"}>{encounter.status === "open" ? "Открыт" : "Завершён"}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">Открыт {formatDate(encounter.openedAt, context.organization.timezone)}{encounter.closedAt ? ` · завершён ${formatDate(encounter.closedAt, context.organization.timezone)}` : ""}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex gap-3"><CircleUserRound className="mt-0.5 size-5 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Пациент</p><Link href={`/patients/${encounter.patientId}`} className="mt-1 block font-semibold hover:text-[var(--brand)]">{encounter.patientName}</Link><p className="mt-1 text-xs text-[var(--muted)]">№ {encounter.patientExternalNumber}</p></div></div>
        </Card>
        <Card className="p-5">
          <div className="flex gap-3"><Stethoscope className="mt-0.5 size-5 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Врач</p><p className="mt-1 font-semibold">{encounter.doctorName}</p><p className="mt-1 text-xs text-[var(--muted)]">{encounter.specializationName}</p></div></div>
        </Card>
        <Card className="p-5">
          <div className="flex gap-3"><MapPin className="mt-0.5 size-5 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Филиал</p><p className="mt-1 font-semibold">{encounter.branchName}</p>{encounter.appointmentStartAt && <p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]"><CalendarClock className="size-3" />{formatDate(encounter.appointmentStartAt, context.organization.timezone)}</p>}</div></div>
        </Card>
      </div>

      <Card className="p-5 lg:p-6">
        {canEdit ? (
          <EncounterForm encounter={encounter} templates={clinicalTemplates.filter((template) => template.isActive)} />
        ) : (
          <div className="grid gap-7 lg:grid-cols-2">
            <ClinicalField label="Жалобы пациента" value={encounter.chiefComplaint} />
            <ClinicalField label="Анамнез" value={encounter.anamnesis} />
            <ClinicalField label="Диагностическое заключение" value={encounter.diagnosisSummary} />
            <ClinicalField label="Клинические заметки" value={encounter.clinicalNotes} />
          </div>
        )}
      </Card>

      <Card className="p-5 lg:p-6">
        <DiagnosisPanel
          encounterId={encounter.id}
          diagnoses={diagnoses}
          options={diagnosisOptions}
          editable={canEdit}
        />
      </Card>

      <Card className="p-5 lg:p-6">
        <PerformedServicesPanel
          encounterId={encounter.id}
          services={serviceCatalog.services}
          planItems={availablePlanItems}
          performedServices={performedServices}
          editable={canEdit}
          currency={context.organization.currency}
          timeZone={context.organization.timezone}
        />
      </Card>

      <Card className="p-5 lg:p-6">
        <OdontogramEditor
          patientId={encounter.patientId}
          encounterId={encounter.id}
          odontogram={odontogram}
          editable={canEdit}
        />
      </Card>

      <Card className="p-5 lg:p-6">
        <AttachmentsPanel
          patientId={encounter.patientId}
          encounterId={encounter.id}
          attachments={attachments}
          editable={context.can("clinical.write")}
          timeZone={context.organization.timezone}
        />
      </Card>
    </div>
  );
}
