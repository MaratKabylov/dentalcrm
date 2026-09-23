import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, FileClock, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { listDoctors } from "@/modules/scheduling/repository";
import { getServiceCatalog } from "@/modules/services/repository";
import { changeTreatmentPlanStatus } from "@/modules/treatment-plans/actions";
import { TREATMENT_PLAN_STATUS_LABELS } from "@/modules/treatment-plans/constants";
import { getTreatmentPlan } from "@/modules/treatment-plans/repository";
import { treatmentPlanIdSchema } from "@/modules/treatment-plans/schemas";
import { TreatmentPlanEditor } from "@/modules/treatment-plans/treatment-plan-editor";
import type { TreatmentPlan, TreatmentPlanStatus } from "@/modules/treatment-plans/types";

const transitions: Partial<Record<TreatmentPlanStatus, Array<{ status: string; label: string }>>> = {
  draft: [{ status: "proposed", label: "Предложить пациенту" }, { status: "cancelled", label: "Отменить" }],
  proposed: [{ status: "approved", label: "Утвердить" }, { status: "rejected", label: "Отклонить" }, { status: "cancelled", label: "Отменить" }],
  approved: [{ status: "in_progress", label: "Начать выполнение" }, { status: "cancelled", label: "Отменить" }],
  in_progress: [{ status: "completed", label: "Завершить" }, { status: "cancelled", label: "Отменить" }],
  rejected: [{ status: "cancelled", label: "Закрыть" }],
};

function PlanStatusActions({ plan }: { plan: TreatmentPlan }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(transitions[plan.status] ?? []).map((transition) => (
        <form action={changeTreatmentPlanStatus} key={transition.status}>
          <input type="hidden" name="planId" value={plan.id} />
          <input type="hidden" name="patientId" value={plan.patientId} />
          <input type="hidden" name="status" value={transition.status} />
          <Button variant={transition.status === "cancelled" || transition.status === "rejected" ? "secondary" : "primary"}>{transition.label}</Button>
        </form>
      ))}
    </div>
  );
}

export default async function TreatmentPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const parsedId = treatmentPlanIdSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const [plan, catalog, doctors, context] = await Promise.all([
    getTreatmentPlan(parsedId.data),
    getServiceCatalog(),
    listDoctors(),
    getOrganizationContext(),
  ]);
  if (!plan || !context) notFound();

  const canManage = context.can("treatment_plan.manage");
  const canEdit = canManage && ["draft", "proposed", "rejected"].includes(plan.status);
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: context.organization.timezone });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href={`/patients/${plan.patientId}/treatment`} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К планам пациента</Link>
      {query.saved === "1" && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CheckCircle2 className="size-4" />Новая версия плана сохранена.</div>}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-[-0.04em]">{plan.title}</h1><span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold">{TREATMENT_PLAN_STATUS_LABELS[plan.status]}</span><span className="text-xs text-[var(--muted)]">версия {plan.currentVersionNo}</span></div><p className="mt-2 text-sm text-[var(--muted)]">{plan.patientName} · врач {plan.doctorName}</p></div>{canManage && <PlanStatusActions plan={plan} />}</div>

      <div className="grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-xs text-[var(--muted)]">Стоимость</p><p className="mt-2 text-xl font-semibold">{money.format(plan.totalAmount)}</p></Card><Card className="p-5"><p className="text-xs text-[var(--muted)]">Скидка</p><p className="mt-2 text-xl font-semibold">{money.format(plan.discountAmount)}</p></Card><Card className="bg-[#123d35] p-5 text-white"><p className="text-xs text-emerald-100/70">Итого</p><p className="mt-2 text-2xl font-semibold">{money.format(plan.finalAmount)}</p></Card></div>

      {canEdit ? (
        <Card className="p-5 lg:p-6"><TreatmentPlanEditor patientId={plan.patientId} plan={plan} doctors={doctors} services={catalog.services} currency={context.organization.currency} /></Card>
      ) : (
        <Card className="overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Позиции плана</h2></div><div className="divide-y">{plan.items.map((item) => <div key={item.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold">{item.serviceCode}</span><p className="font-semibold">{item.serviceName}</p>{item.toothCode && <span className="text-xs text-[var(--muted)]">зуб {item.toothCode}</span>}</div><p className="mt-1 text-xs text-[var(--muted)]">{item.quantity} × {money.format(item.unitPrice)}{item.discountAmount > 0 ? ` · скидка ${money.format(item.discountAmount)}` : ""}</p></div><p className="font-semibold">{money.format(item.amount)}</p></div>)}</div></Card>
      )}

      <Card className="p-5"><div className="flex items-center gap-2"><FileClock className="size-4 text-[var(--brand)]" /><h2 className="font-semibold">История версий</h2></div><div className="mt-4 space-y-3">{plan.versions.map((version) => <div key={version.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-sm"><span className="font-semibold">Версия {version.versionNo}</span><span className="flex items-center gap-1 text-xs text-[var(--muted)]"><Clock3 className="size-3" />{date.format(new Date(version.createdAt))}</span><span className="ml-auto font-medium">{money.format(version.finalAmount)}</span></div>)}</div><div className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]"><UserRound className="size-3.5" />Ответственный врач: {plan.doctorName}</div></Card>
    </div>
  );
}
