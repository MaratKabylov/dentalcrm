"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Ban, CircleDollarSign, LoaderCircle, Plus, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { FDI_TOOTH_CODES } from "@/modules/odontogram/constants";
import {
  addPerformedService,
  voidPerformedService,
} from "@/modules/performed-services/actions";
import type {
  AvailableTreatmentPlanItem,
  PerformedService,
} from "@/modules/performed-services/types";
import type { TreatmentService } from "@/modules/services/types";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

export function PerformedServicesPanel({
  encounterId,
  services,
  planItems,
  performedServices,
  editable,
  currency,
  timeZone,
}: {
  encounterId: string;
  services: TreatmentService[];
  planItems: AvailableTreatmentPlanItem[];
  performedServices: PerformedService[];
  editable: boolean;
  currency: string;
  timeZone: string;
}) {
  const activeServices = useMemo(
    () => services.filter((service) => service.isActive),
    [services],
  );
  const initialSelection = planItems[0]
    ? `plan:${planItems[0].treatmentPlanItemId}`
    : activeServices[0]
      ? `service:${activeServices[0].id}`
      : "";
  const [state, formAction, pending] = useActionState(addPerformedService, initialFormState);
  const [selection, setSelection] = useState(initialSelection);
  const [toothCode, setToothCode] = useState(planItems[0]?.toothCode ?? "");
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");

  const selectedPlanItem = selection.startsWith("plan:")
    ? planItems.find((item) => `plan:${item.treatmentPlanItemId}` === selection)
    : undefined;
  const selectedService = selection.startsWith("service:")
    ? activeServices.find((service) => `service:${service.id}` === selection)
    : undefined;
  const validSelection = selectedPlanItem || selectedService ? selection : "";
  const unitPrice = selectedPlanItem?.unitPrice ?? selectedService?.basePrice ?? 0;
  const calculatedAmount = Math.max(
    0,
    Math.round(((Number(quantity) || 0) * unitPrice - (Number(discount) || 0)) * 100) / 100,
  );
  const money = useMemo(
    () => new Intl.NumberFormat("ru-KZ", { style: "currency", currency }),
    [currency],
  );
  const dateTime = useMemo(
    () => new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }),
    [timeZone],
  );
  const activeTotal = performedServices.reduce(
    (sum, service) => service.voidedAt ? sum : sum + service.finalAmount,
    0,
  );

  function handleSelection(nextSelection: string) {
    setSelection(nextSelection);
    const planItem = planItems.find(
      (item) => `plan:${item.treatmentPlanItemId}` === nextSelection,
    );
    setToothCode(planItem?.toothCode ?? "");
    setQuantity("1");
    setDiscount("0");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="font-semibold">Выполненные процедуры</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Фактически оказанные услуги и зафиксированная стоимость на момент приёма.
          </p>
        </div>
        <div className="rounded-xl bg-[var(--brand-soft)] px-4 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Итого по приёму</p>
          <p className="mt-0.5 font-semibold text-[var(--brand)]">{money.format(activeTotal)}</p>
        </div>
      </div>

      {performedServices.length === 0 ? (
        <div className="rounded-xl bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--muted)]">
          Выполненные процедуры ещё не добавлены.
        </div>
      ) : (
        <div className="space-y-3">
          {performedServices.map((service) => (
            <div
              key={service.id}
              className={service.voidedAt
                ? "rounded-xl border border-dashed bg-[var(--surface-muted)] p-4 opacity-70"
                : "rounded-xl border p-4"}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  {service.voidedAt ? <Ban className="size-4" /> : <Stethoscope className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={service.voidedAt ? "font-semibold line-through" : "font-semibold"}>
                      {service.serviceCode} — {service.serviceName}
                    </span>
                    {service.toothCode && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Зуб {service.toothCode}
                      </span>
                    )}
                    {service.voidedAt && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-[var(--danger)]">
                        Аннулировано
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                    <span>{formatQuantity(service.quantity)} × {money.format(service.unitPrice)}</span>
                    {service.discountAmount > 0 && <span>Скидка {money.format(service.discountAmount)}</span>}
                    <span>{dateTime.format(new Date(service.performedAt))}</span>
                    {service.treatmentPlanId && service.treatmentPlanTitle && (
                      <Link href={`/clinical/treatment-plans/${service.treatmentPlanId}`} className="font-medium text-[var(--brand)] hover:underline">
                        План: {service.treatmentPlanTitle}
                      </Link>
                    )}
                  </div>
                  {service.notes && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">{service.notes}</p>}
                  {service.voidReason && <p className="mt-2 text-xs text-[var(--danger)]">Причина: {service.voidReason}</p>}
                </div>
                <div className="text-left sm:text-right">
                  <p className={service.voidedAt ? "font-semibold line-through" : "font-semibold"}>{money.format(service.finalAmount)}</p>
                </div>
              </div>

              {editable && !service.voidedAt && (
                <details className="mt-3 border-t pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--danger)]">Аннулировать запись</summary>
                  <form action={voidPerformedService} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="encounterId" value={encounterId} />
                    <input type="hidden" name="performedServiceId" value={service.id} />
                    <Input name="reason" minLength={3} maxLength={500} required placeholder="Причина аннулирования" />
                    <Button type="submit" variant="secondary" className="shrink-0 text-[var(--danger)]">
                      <Ban className="size-4" />Аннулировать
                    </Button>
                  </form>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <form action={formAction} className="space-y-5 rounded-2xl bg-[var(--surface-muted)] p-4 sm:p-5">
          <input type="hidden" name="encounterId" value={encounterId} />
          <input type="hidden" name="serviceId" value={selectedService?.id ?? selectedPlanItem?.serviceId ?? ""} />
          <input type="hidden" name="treatmentPlanItemId" value={selectedPlanItem?.treatmentPlanItemId ?? ""} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium">Услуга *</span>
              <select
                value={validSelection}
                onChange={(event) => handleSelection(event.target.value)}
                className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm"
                required
              >
                <option value="" disabled>Выберите услугу</option>
                {planItems.length > 0 && (
                  <optgroup label="Из утверждённых планов лечения">
                    {planItems.map((item) => (
                      <option key={item.treatmentPlanItemId} value={`plan:${item.treatmentPlanItemId}`}>
                        {item.treatmentPlanTitle} · {item.serviceCode} — {item.serviceName} · остаток {formatQuantity(item.remainingQuantity)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {activeServices.length > 0 && (
                  <optgroup label="Вне плана — каталог услуг">
                    {activeServices.map((service) => (
                      <option key={service.id} value={`service:${service.id}`}>
                        {service.code} — {service.name} · {money.format(service.basePrice)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <FieldError errors={state.fieldErrors?.serviceId} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">Зуб</span>
              <select
                name="toothCode"
                value={toothCode}
                onChange={(event) => setToothCode(event.target.value)}
                className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm"
              >
                <option value="">Без привязки к зубу</option>
                {FDI_TOOTH_CODES.map((code) => <option key={code} value={code}>Зуб {code}</option>)}
              </select>
              <FieldError errors={state.fieldErrors?.toothCode} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">Цена за единицу</span>
              <div className="flex h-11 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-medium">
                <CircleDollarSign className="size-4 text-[var(--brand)]" />{money.format(unitPrice)}
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">Количество *</span>
              <Input
                name="quantity"
                type="number"
                min="0.01"
                max={selectedPlanItem?.remainingQuantity ?? 100}
                step="0.01"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
              {selectedPlanItem && <span className="text-xs text-[var(--muted)]">Остаток по плану: {formatQuantity(selectedPlanItem.remainingQuantity)}</span>}
              <FieldError errors={state.fieldErrors?.quantity} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">Скидка</span>
              <Input
                name="discountAmount"
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                required
              />
              <FieldError errors={state.fieldErrors?.discountAmount} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium">Комментарий</span>
              <textarea
                name="notes"
                maxLength={2000}
                className="min-h-24 w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm"
                placeholder="Особенности выполненной процедуры"
              />
              <FieldError errors={state.fieldErrors?.notes} />
            </label>
          </div>

          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs text-[var(--muted)]">Итоговая стоимость</p>
              <p className="mt-0.5 text-lg font-semibold">{money.format(calculatedAmount)}</p>
            </div>
            <Button disabled={pending || !validSelection}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {pending ? "Сохранение…" : "Добавить процедуру"}
            </Button>
          </div>

          {state.message && (
            <div role="status" className={state.status === "success"
              ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"}
            >
              {state.message}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
