import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, ClipboardList, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { getPatient } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/schemas";
import { TREATMENT_PLAN_STATUS_LABELS } from "@/modules/treatment-plans/constants";
import { listPatientTreatmentPlans } from "@/modules/treatment-plans/repository";

export default async function PatientTreatmentPlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = patientIdSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const [patient, plans, context] = await Promise.all([
    getPatient(parsedId.data),
    listPatientTreatmentPlans(parsedId.data),
    getOrganizationContext(),
  ]);
  if (!patient || !context) notFound();

  const patientName = [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ");
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={`/patients/${patient.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К карточке пациента</Link>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-[var(--brand)]">{patientName} · № {patient.externalNumber}</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Планы лечения</h1><p className="mt-2 text-sm text-[var(--muted)]">Версии, согласование и выполнение планов пациента.</p></div>
        {context.can("treatment_plan.manage") && <Link href={`/patients/${patient.id}/treatment/new`}><Button><Plus className="size-4" />Новый план</Button></Link>}
      </div>

      {plans.length === 0 ? (
        <Card className="grid min-h-72 place-items-center p-8 text-center"><div><ClipboardList className="mx-auto size-10 text-[var(--brand)]" /><h2 className="mt-4 font-semibold">Планов лечения пока нет</h2><p className="mt-2 text-sm text-[var(--muted)]">Создайте первый план на основе каталога услуг.</p></div></Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {plans.map((plan) => (
            <Link key={plan.id} href={`/clinical/treatment-plans/${plan.id}`} className="flex items-center gap-4 p-5 transition hover:bg-[var(--surface-muted)]">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{plan.title}</p><span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold">{TREATMENT_PLAN_STATUS_LABELS[plan.status]}</span><span className="text-[10px] text-[var(--muted)]">версия {plan.currentVersionNo}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{plan.doctorName}</p></div>
              <p className="shrink-0 font-semibold text-[var(--brand-dark)]">{money.format(plan.finalAmount)}</p>
              <ChevronRight className="size-4 shrink-0 text-[var(--muted)]" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
