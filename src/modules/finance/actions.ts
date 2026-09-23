"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import {
  applyInvoiceDiscountSchema,
  closeCashShiftSchema,
  createDiscountDefinitionSchema,
  createInvoiceFromEncounterSchema,
  openCashShiftSchema,
  recordInvoicePaymentSchema,
  recordPaymentRefundSchema,
  reversePaymentSchema,
  setDiscountDefinitionActiveSchema,
  setDiscountRoleLimitSchema,
} from "@/modules/finance/schemas";
import { requirePermission } from "@/modules/organizations/repository";

export async function createInvoiceFromEncounter(formData: FormData) {
  const context = await requirePermission("finance.manage");
  const parsed = createInvoiceFromEncounterSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice_from_encounter", {
    org_id: context.organization.id,
    target_encounter_id: parsed.encounterId,
  });
  if (error) throw new Error("Не удалось выставить счёт по врачебному приёму.");
  const invoiceId = z.uuid().parse(data);

  revalidatePath("/finance");
  revalidatePath(`/clinical/encounters/${parsed.encounterId}`);
  redirect(`/finance/invoices/${invoiceId}`);
}

export async function openCashShift(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("cashdesk.manage");
  const parsed = openCashShiftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте остаток при открытии смены.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_cash_shift", {
    org_id: context.organization.id,
    target_cash_desk_id: parsed.data.cashDeskId,
    shift_opening_balance: parsed.data.openingBalance,
  });
  if (error) return { status: "error", message: "Не удалось открыть кассовую смену." };
  revalidatePath("/finance/cash");
  return { status: "success", message: "Кассовая смена открыта." };
}

export async function closeCashShift(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("cashdesk.manage");
  const parsed = closeCashShiftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте фактический остаток.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cash_shift", {
    org_id: context.organization.id,
    target_shift_id: parsed.data.shiftId,
    counted_closing_balance: parsed.data.closingBalance,
  });
  if (error) return { status: "error", message: "Не удалось закрыть кассовую смену." };
  revalidatePath("/finance/cash");
  return { status: "success", message: "Кассовая смена закрыта." };
}

export async function recordInvoicePayment(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("cashdesk.manage");
  const parsed = recordInvoicePaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте параметры платежа.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_invoice_payment", {
    org_id: context.organization.id,
    target_invoice_id: parsed.data.invoiceId,
    target_cash_shift_id: parsed.data.cashShiftId,
    target_payment_method_id: parsed.data.paymentMethodId,
    payment_amount: parsed.data.amount,
    payment_external_reference: parsed.data.externalReference ?? null,
  });
  if (error) {
    return { status: "error", message: "Не удалось провести платёж. Проверьте остаток счёта и открытую смену." };
  }
  revalidatePath(`/finance/invoices/${parsed.data.invoiceId}`);
  revalidatePath("/finance");
  revalidatePath("/finance/payments");
  revalidatePath("/finance/cash");
  return { status: "success", message: "Платёж проведён и отражён в лицевом счёте пациента." };
}

export async function reversePayment(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("cashdesk.manage");
  if (!context.can("finance.manage")) {
    return { status: "error", message: "Для сторнирования нужны права на управление финансами и кассой." };
  }
  const parsed = reversePaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Укажите причину сторнирования.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_payment", {
    org_id: context.organization.id,
    target_payment_id: parsed.data.paymentId,
    reversal_reason: parsed.data.reason,
  });
  if (error) {
    return { status: "error", message: "Не удалось сторнировать платёж. Проверьте, что его смена открыта и по нему ещё не было возвратов." };
  }
  const invoiceId = z.uuid().safeParse(data);
  if (invoiceId.success) revalidatePath(`/finance/invoices/${invoiceId.data}`);
  revalidatePath("/finance");
  revalidatePath("/finance/payments");
  revalidatePath("/finance/cash");
  revalidatePath(`/patients/${formData.get("patientId")}/finance`);
  return { status: "success", message: "Платёж сторнирован, задолженность по счёту восстановлена." };
}

export async function recordPaymentRefund(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("cashdesk.manage");
  if (!context.can("finance.manage")) {
    return { status: "error", message: "Для возврата нужны права на управление финансами и кассой." };
  }
  const parsed = recordPaymentRefundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте сумму, способ и причину возврата.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment_refund", {
    org_id: context.organization.id,
    target_payment_id: parsed.data.paymentId,
    target_cash_shift_id: parsed.data.cashShiftId,
    target_payment_method_id: parsed.data.paymentMethodId,
    refund_amount: parsed.data.amount,
    refund_reason: parsed.data.reason,
    refund_external_reference: parsed.data.externalReference ?? null,
  });
  if (error) {
    return { status: "error", message: "Не удалось оформить возврат. Проверьте доступный остаток платежа, открытую смену и сумму наличных." };
  }
  revalidatePath("/finance");
  revalidatePath("/finance/payments");
  revalidatePath("/finance/cash");
  revalidatePath(`/finance/invoices/${formData.get("invoiceId")}`);
  revalidatePath(`/patients/${formData.get("patientId")}/finance`);
  return { status: "success", message: "Возврат оформлен и отражён в кассе и лицевом счёте пациента." };
}

export async function applyInvoiceDiscount(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("finance.manage");
  const parsed = applyInvoiceDiscountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Выберите скидку и укажите основание.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_invoice_discount", {
    org_id: context.organization.id,
    target_invoice_id: parsed.data.invoiceId,
    target_discount_id: parsed.data.discountId,
    application_reason: parsed.data.reason,
  });
  if (error) {
    return { status: "error", message: "Не удалось применить скидку. Проверьте ролевой лимит и неоплаченный остаток счёта." };
  }
  revalidatePath(`/finance/invoices/${parsed.data.invoiceId}`);
  revalidatePath("/finance");
  return { status: "success", message: "Скидка применена и отражена в лицевом счёте пациента." };
}

export async function createDiscountDefinition(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("settings.manage");
  const parsed = createDiscountDefinitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте название, тип и значение скидки.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_discount_definition", {
    org_id: context.organization.id,
    discount_name: parsed.data.name,
    new_discount_type: parsed.data.type,
    discount_value: parsed.data.value,
  });
  if (error) {
    return { status: "error", message: "Не удалось создать скидку. Возможно, такое название уже используется." };
  }
  revalidatePath("/finance/discounts");
  return { status: "success", message: "Скидка добавлена в справочник." };
}

export async function setDiscountDefinitionActive(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("settings.manage");
  const parsed = setDiscountDefinitionActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Некорректные параметры скидки." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_discount_definition_active", {
    org_id: context.organization.id,
    target_discount_id: parsed.data.discountId,
    new_is_active: parsed.data.isActive,
  });
  if (error) return { status: "error", message: "Не удалось изменить статус скидки." };
  revalidatePath("/finance/discounts");
  revalidatePath("/finance");
  return { status: "success", message: parsed.data.isActive ? "Скидка включена." : "Скидка отключена." };
}

export async function setDiscountRoleLimit(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("settings.manage");
  const parsed = setDiscountRoleLimitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Укажите лимит от 0 до 100%.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_discount_role_limit", {
    org_id: context.organization.id,
    target_role_id: parsed.data.roleId,
    new_max_discount_percent: parsed.data.maxDiscountPercent,
  });
  if (error) return { status: "error", message: "Не удалось обновить ролевой лимит." };
  revalidatePath("/finance/discounts");
  return { status: "success", message: "Ролевой лимит обновлён." };
}
