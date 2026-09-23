"use client";

import { useActionState, useMemo, useState } from "react";
import { GripVertical, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { FDI_TOOTH_CODES } from "@/modules/odontogram/constants";
import type { DoctorOption } from "@/modules/scheduling/types";
import type { TreatmentService } from "@/modules/services/types";
import { saveTreatmentPlan } from "@/modules/treatment-plans/actions";
import type { TreatmentPlan } from "@/modules/treatment-plans/types";

type DraftItem = {
  key: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  toothCode: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  priority: number;
  notes: string;
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

function initialItems(plan: TreatmentPlan | null): DraftItem[] {
  return plan?.items.map((item) => ({
    key: item.id,
    serviceId: item.serviceId,
    serviceCode: item.serviceCode,
    serviceName: item.serviceName,
    toothCode: item.toothCode ?? "",
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    priority: item.priority,
    notes: item.notes ?? "",
  })) ?? [];
}

export function TreatmentPlanEditor({
  patientId,
  plan,
  doctors,
  services,
  currency,
}: {
  patientId: string;
  plan: TreatmentPlan | null;
  doctors: DoctorOption[];
  services: TreatmentService[];
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(saveTreatmentPlan, initialFormState);
  const [items, setItems] = useState<DraftItem[]>(() => initialItems(plan));
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const money = useMemo(() => new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 2 }), [currency]);
  const activeServices = services.filter((service) => service.isActive);

  const payload = items.map((item, index) => ({
    serviceId: item.serviceId,
    toothCode: item.toothCode || null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    priority: item.priority,
    plannedOrder: index + 1,
    notes: item.notes.trim() || null,
  }));

  const totals = items.reduce((result, item) => {
    const gross = item.quantity * item.unitPrice;
    return {
      gross: result.gross + gross,
      discount: result.discount + item.discountAmount,
      final: result.final + Math.max(0, gross - item.discountAmount),
    };
  }, { gross: 0, discount: 0, final: 0 });

  function addService() {
    const service = activeServices.find((item) => item.id === selectedServiceId);
    if (!service) return;
    setItems((current) => [...current, {
      key: crypto.randomUUID(),
      serviceId: service.id,
      serviceCode: service.code,
      serviceName: service.name,
      toothCode: "",
      quantity: 1,
      unitPrice: service.basePrice,
      discountAmount: 0,
      priority: 3,
      notes: "",
    }]);
    setSelectedServiceId("");
  }

  function updateItem(key: string, update: Partial<DraftItem>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...update } : item));
  }

  return (
    <form action={formAction} className="space-y-6">
      {plan && <input type="hidden" name="planId" value={plan.id} />}
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="items" value={JSON.stringify(payload)} />

      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Название плана *</span>
          <Input name="title" defaultValue={plan?.title ?? "План лечения"} maxLength={240} required />
          <FieldError errors={state.fieldErrors?.title} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Ответственный врач *</span>
          <select name="doctorId" defaultValue={plan?.doctorId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm" required>
            <option value="" disabled>Выберите врача</option>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName} · {doctor.specializationName}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.doctorId} />
        </label>
      </div>

      <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)} className="h-11 flex-1 rounded-xl border bg-white px-3.5 text-sm">
            <option value="">Выберите услугу из каталога</option>
            {activeServices.map((service) => <option key={service.id} value={service.id}>{service.code} — {service.name} · {money.format(service.basePrice)}</option>)}
          </select>
          <Button type="button" onClick={addService} disabled={!selectedServiceId}><Plus className="size-4" />Добавить</Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-[var(--muted)]">Добавьте хотя бы одну услугу в план лечения.</div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => {
            const gross = item.quantity * item.unitPrice;
            const amount = Math.max(0, gross - item.discountAmount);
            return (
              <div key={item.key} className="rounded-2xl border p-4">
                <div className="flex items-start gap-3">
                  <GripVertical className="mt-1 size-4 shrink-0 text-[var(--muted)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold">{item.serviceCode}</span><p className="font-semibold">{item.serviceName}</p></div><p className="mt-1 text-xs text-[var(--muted)]">Этап {index + 1} · сумма {money.format(amount)}</p></div>
                      <button type="button" onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-red-50 hover:text-[var(--danger)]" aria-label={`Удалить ${item.serviceName}`}><Trash2 className="size-4" /></button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <label className="space-y-1.5"><span className="text-xs text-[var(--muted)]">Зуб</span><select value={item.toothCode} onChange={(event) => updateItem(item.key, { toothCode: event.target.value })} className="h-10 w-full rounded-xl border bg-white px-3 text-xs"><option value="">Без зуба</option>{FDI_TOOTH_CODES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
                      <label className="space-y-1.5"><span className="text-xs text-[var(--muted)]">Количество</span><Input className="h-10" type="number" min={0.01} max={100} step="0.01" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: Number(event.target.value) })} /></label>
                      <label className="space-y-1.5"><span className="text-xs text-[var(--muted)]">Цена</span><Input className="h-10" type="number" min={0} step="0.01" value={item.unitPrice} onChange={(event) => updateItem(item.key, { unitPrice: Number(event.target.value) })} /></label>
                      <label className="space-y-1.5"><span className="text-xs text-[var(--muted)]">Скидка</span><Input className="h-10" type="number" min={0} max={gross} step="0.01" value={item.discountAmount} onChange={(event) => updateItem(item.key, { discountAmount: Number(event.target.value) })} /></label>
                      <label className="space-y-1.5"><span className="text-xs text-[var(--muted)]">Приоритет</span><select value={item.priority} onChange={(event) => updateItem(item.key, { priority: Number(event.target.value) })} className="h-10 w-full rounded-xl border bg-white px-3 text-xs">{[1, 2, 3, 4, 5].map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
                    </div>
                    <label className="mt-3 block space-y-1.5"><span className="text-xs text-[var(--muted)]">Комментарий</span><textarea value={item.notes} onChange={(event) => updateItem(item.key, { notes: event.target.value })} maxLength={2000} className="min-h-20 w-full resize-y rounded-xl border bg-white px-3 py-2 text-sm" /></label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 rounded-2xl bg-[#123d35] p-5 text-white sm:grid-cols-3">
        <div><p className="text-xs text-emerald-100/70">Стоимость</p><p className="mt-1 text-lg font-semibold">{money.format(totals.gross)}</p></div>
        <div><p className="text-xs text-emerald-100/70">Скидка</p><p className="mt-1 text-lg font-semibold">{money.format(totals.discount)}</p></div>
        <div><p className="text-xs text-emerald-100/70">Итого</p><p className="mt-1 text-xl font-semibold">{money.format(totals.final)}</p></div>
      </div>

      {state.message && <div role="status" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{state.message}</div>}
      <div className="flex justify-end"><Button disabled={pending || items.length === 0}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Сохранение…" : plan ? "Сохранить новую версию" : "Создать план"}</Button></div>
    </form>
  );
}
