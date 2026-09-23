import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import type {
  BillableEncounter,
  CashDeskState,
  DebtAgingBucket,
  DebtAgingSummary,
  DebtInvoiceItem,
  DiscountApplication,
  DiscountDefinition,
  DiscountRoleLimit,
  FinanceBranchOption,
  InvoiceDetails,
  InvoiceItem,
  InvoiceListItem,
  InvoiceSummary,
  PatientLedgerEntry,
  PaymentListItem,
  PaymentMethod,
  PaymentRefundListItem,
} from "@/modules/finance/types";
import { requirePermission } from "@/modules/organizations/repository";

const invoiceStatusSchema = z.enum(["issued", "partially_paid", "paid"]);

const billableEncounterRowSchema = z.object({
  encounter_id: z.uuid(),
  patient_id: z.uuid(),
  patient_name: z.string(),
  patient_external_number: z.string(),
  doctor_name: z.string(),
  branch_name: z.string(),
  closed_at: z.string(),
  procedure_count: z.coerce.number().int(),
  total_amount: z.coerce.number(),
});

const invoiceListRowSchema = z.object({
  id: z.uuid(),
  invoice_number: z.string(),
  patient_id: z.uuid(),
  patient_name: z.string(),
  patient_external_number: z.string(),
  branch_name: z.string(),
  encounter_id: z.uuid().nullable(),
  status: invoiceStatusSchema,
  total_amount: z.coerce.number(),
  paid_amount: z.coerce.number(),
  debt_amount: z.coerce.number(),
  issued_at: z.string(),
});

const invoiceDetailsRowSchema = invoiceListRowSchema.extend({
  branch_id: z.uuid(),
  subtotal: z.coerce.number(),
  discount_amount: z.coerce.number(),
});

const invoiceItemRowSchema = z.object({
  id: z.uuid(),
  service_id: z.uuid().nullable(),
  performed_service_id: z.uuid().nullable(),
  description: z.string(),
  quantity: z.coerce.number(),
  unit_price: z.coerce.number(),
  discount_amount: z.coerce.number(),
  amount: z.coerce.number(),
});

const invoiceSummaryRowSchema = z.object({
  invoice_count: z.coerce.number().int(),
  total_amount: z.coerce.number(),
  debt_amount: z.coerce.number(),
});

const debtAgingSummaryRowSchema = z.object({
  patient_count: z.coerce.number().int(),
  invoice_count: z.coerce.number().int(),
  total_debt: z.coerce.number(),
  debt_0_7: z.coerce.number(),
  debt_8_30: z.coerce.number(),
  debt_31_60: z.coerce.number(),
  debt_61_90: z.coerce.number(),
  debt_91_plus: z.coerce.number(),
  maximum_age_days: z.coerce.number().int(),
});

const debtInvoiceRowSchema = z.object({
  invoice_id: z.uuid(),
  invoice_number: z.string(),
  patient_id: z.uuid(),
  patient_name: z.string(),
  patient_external_number: z.string(),
  patient_phone: z.string(),
  branch_id: z.uuid(),
  branch_name: z.string(),
  invoice_status: invoiceStatusSchema,
  total_amount: z.coerce.number(),
  paid_amount: z.coerce.number(),
  debt_amount: z.coerce.number(),
  issued_at: z.string(),
  age_days: z.coerce.number().int(),
  aging_bucket: z.enum(["0_7", "8_30", "31_60", "61_90", "91_plus"]),
});

const financeBranchRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

const discountDefinitionRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  discount_type: z.enum(["percentage", "fixed"]),
  value: z.coerce.number(),
  is_active: z.boolean(),
  created_at: z.string(),
});

const discountApplicationRowSchema = z.object({
  id: z.uuid(),
  discount_id: z.uuid(),
  discount_name: z.string(),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.coerce.number(),
  amount_before: z.coerce.number(),
  discount_amount: z.coerce.number(),
  amount_after: z.coerce.number(),
  reason: z.string(),
  applied_by_name: z.string(),
  applied_at: z.string(),
});

const discountRoleLimitRowSchema = z.object({
  role_id: z.uuid(),
  role_code: z.string(),
  role_name: z.string(),
  max_discount_percent: z.coerce.number(),
});

const paymentMethodRowSchema = z.object({
  id: z.uuid(),
  code: z.enum(["cash", "card", "kaspi", "bank_transfer", "other"]),
  name: z.string(),
  is_active: z.boolean(),
});

const cashDeskRowSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid(),
  branch_name: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  open_shift_id: z.uuid().nullable(),
  opened_at: z.string().nullable(),
  opened_by_name: z.string().nullable(),
  opening_balance: z.coerce.number().nullable(),
  cash_payments_total: z.coerce.number(),
  cash_refunds_total: z.coerce.number(),
  expected_cash_balance: z.coerce.number().nullable(),
});

const paymentRowSchema = z.object({
  id: z.uuid(),
  receipt_number: z.string(),
  patient_id: z.uuid(),
  patient_name: z.string(),
  invoice_id: z.uuid().nullable(),
  invoice_number: z.string().nullable(),
  branch_id: z.uuid(),
  cash_desk_name: z.string(),
  branch_name: z.string(),
  cash_shift_id: z.uuid(),
  cash_shift_status: z.enum(["open", "closed"]),
  payment_method_code: z.enum(["cash", "card", "kaspi", "bank_transfer", "other"]),
  payment_method_name: z.string(),
  amount: z.coerce.number(),
  refunded_amount: z.coerce.number(),
  paid_at: z.string(),
  status: z.enum(["posted", "partially_refunded", "refunded", "reversed"]),
  external_reference: z.string().nullable(),
  reversal_reason: z.string().nullable(),
});

const paymentRefundRowSchema = z.object({
  id: z.uuid(),
  refund_number: z.string(),
  payment_id: z.uuid(),
  receipt_number: z.string(),
  patient_id: z.uuid(),
  patient_name: z.string(),
  invoice_id: z.uuid(),
  invoice_number: z.string(),
  cash_desk_name: z.string(),
  branch_name: z.string(),
  payment_method_name: z.string(),
  amount: z.coerce.number(),
  reason: z.string(),
  external_reference: z.string().nullable(),
  refunded_at: z.string(),
});

const ledgerRowSchema = z.object({
  id: z.uuid(),
  invoice_id: z.uuid().nullable(),
  invoice_number: z.string().nullable(),
  payment_id: z.uuid().nullable(),
  entry_type: z.enum(["charge", "payment", "refund", "reversal", "adjustment"]),
  debit_amount: z.coerce.number(),
  credit_amount: z.coerce.number(),
  description: z.string(),
  occurred_at: z.string(),
});

function toInvoiceListItem(row: z.infer<typeof invoiceListRowSchema>): InvoiceListItem {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientExternalNumber: row.patient_external_number,
    branchName: row.branch_name,
    encounterId: row.encounter_id,
    status: row.status,
    totalAmount: row.total_amount,
    paidAmount: row.paid_amount,
    debtAmount: row.debt_amount,
    issuedAt: row.issued_at,
  };
}

export async function listBillableEncounters(): Promise<BillableEncounter[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_billable_encounters", {
    org_id: context.organization.id,
  });
  if (error) throw new AppError("BILLABLE_ENCOUNTERS_LOAD_FAILED", "Не удалось загрузить приёмы для выставления счетов.");
  const parsed = z.array(billableEncounterRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_BILLABLE_ENCOUNTER_DATA", "Получены некорректные финансовые данные приёмов.");
  return parsed.data.map((row) => ({
    encounterId: row.encounter_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientExternalNumber: row.patient_external_number,
    doctorName: row.doctor_name,
    branchName: row.branch_name,
    closedAt: row.closed_at,
    procedureCount: row.procedure_count,
    totalAmount: row.total_amount,
  }));
}

export async function listInvoices(patientId?: string): Promise<InvoiceListItem[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_invoices", {
    org_id: context.organization.id,
    target_patient_id: patientId ?? null,
    result_limit: 100,
  });
  if (error) throw new AppError("INVOICES_LOAD_FAILED", "Не удалось загрузить счета.");
  const parsed = z.array(invoiceListRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_INVOICE_DATA", "Получены некорректные данные счетов.");
  return parsed.data.map(toInvoiceListItem);
}

export async function getInvoice(invoiceId: string): Promise<InvoiceDetails | null> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invoice", {
    org_id: context.organization.id,
    target_invoice_id: invoiceId,
  });
  if (error) throw new AppError("INVOICE_LOAD_FAILED", "Не удалось загрузить счёт.");
  const parsed = z.array(invoiceDetailsRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_INVOICE_DATA", "Получены некорректные данные счёта.");
  const row = parsed.data[0];
  if (!row) return null;
  return {
    ...toInvoiceListItem(row),
    branchId: row.branch_id,
    subtotal: row.subtotal,
    discountAmount: row.discount_amount,
  };
}

export async function listInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_invoice_items", {
    org_id: context.organization.id,
    target_invoice_id: invoiceId,
  });
  if (error) throw new AppError("INVOICE_ITEMS_LOAD_FAILED", "Не удалось загрузить позиции счёта.");
  const parsed = z.array(invoiceItemRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_INVOICE_ITEM_DATA", "Получены некорректные позиции счёта.");
  return parsed.data.map((row) => ({
    id: row.id,
    serviceId: row.service_id,
    performedServiceId: row.performed_service_id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    discountAmount: row.discount_amount,
    amount: row.amount,
  }));
}

export async function getInvoiceSummary(patientId?: string): Promise<InvoiceSummary> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invoice_summary", {
    org_id: context.organization.id,
    target_patient_id: patientId ?? null,
  });
  if (error) throw new AppError("INVOICE_SUMMARY_LOAD_FAILED", "Не удалось загрузить финансовую сводку.");
  const parsed = z.array(invoiceSummaryRowSchema).safeParse(data ?? []);
  if (!parsed.success || !parsed.data[0]) throw new AppError("INVALID_INVOICE_SUMMARY_DATA", "Получена некорректная финансовая сводка.");
  return {
    invoiceCount: parsed.data[0].invoice_count,
    totalAmount: parsed.data[0].total_amount,
    debtAmount: parsed.data[0].debt_amount,
  };
}

export async function getDebtAgingSummary(branchId?: string): Promise<DebtAgingSummary> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_debt_aging_summary", {
    org_id: context.organization.id,
    target_branch_id: branchId ?? null,
  });
  if (error) throw new AppError("DEBT_AGING_SUMMARY_LOAD_FAILED", "Не удалось загрузить сводку задолженности.");
  const parsed = z.array(debtAgingSummaryRowSchema).safeParse(data ?? []);
  if (!parsed.success || !parsed.data[0]) throw new AppError("INVALID_DEBT_AGING_SUMMARY_DATA", "Получена некорректная сводка задолженности.");
  const row = parsed.data[0];
  return {
    patientCount: row.patient_count,
    invoiceCount: row.invoice_count,
    totalDebt: row.total_debt,
    debt0To7: row.debt_0_7,
    debt8To30: row.debt_8_30,
    debt31To60: row.debt_31_60,
    debt61To90: row.debt_61_90,
    debt91Plus: row.debt_91_plus,
    maximumAgeDays: row.maximum_age_days,
  };
}

export async function listDebtInvoices(filters: {
  branchId?: string;
  agingBucket?: DebtAgingBucket | "all";
  query?: string;
} = {}): Promise<DebtInvoiceItem[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_debt_invoices", {
    org_id: context.organization.id,
    target_branch_id: filters.branchId ?? null,
    target_aging_bucket: filters.agingBucket ?? "all",
    search_query: filters.query || null,
    result_limit: 500,
  });
  if (error) throw new AppError("DEBT_INVOICES_LOAD_FAILED", "Не удалось загрузить реестр задолженности.");
  const parsed = z.array(debtInvoiceRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_DEBT_INVOICE_DATA", "Получены некорректные данные задолженности.");
  return parsed.data.map((row) => ({
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientExternalNumber: row.patient_external_number,
    patientPhone: row.patient_phone,
    branchId: row.branch_id,
    branchName: row.branch_name,
    invoiceStatus: row.invoice_status,
    totalAmount: row.total_amount,
    paidAmount: row.paid_amount,
    debtAmount: row.debt_amount,
    issuedAt: row.issued_at,
    ageDays: row.age_days,
    agingBucket: row.aging_bucket,
  }));
}

export async function listFinanceBranches(): Promise<FinanceBranchOption[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, name")
    .eq("organization_id", context.organization.id)
    .eq("is_active", true)
    .order("name");
  if (error) throw new AppError("FINANCE_BRANCHES_LOAD_FAILED", "Не удалось загрузить филиалы.");
  const parsed = z.array(financeBranchRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_FINANCE_BRANCH_DATA", "Получены некорректные данные филиалов.");
  return parsed.data;
}

export async function listDiscounts(includeInactive = false): Promise<DiscountDefinition[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_discounts", {
    org_id: context.organization.id,
    include_inactive: includeInactive,
  });
  if (error) throw new AppError("DISCOUNTS_LOAD_FAILED", "Не удалось загрузить справочник скидок.");
  const parsed = z.array(discountDefinitionRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_DISCOUNT_DATA", "Получены некорректные данные скидок.");
  return parsed.data.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.discount_type,
    value: row.value,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
}

export async function getCurrentDiscountLimit(): Promise<number> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_current_discount_limit", {
    org_id: context.organization.id,
  });
  if (error) throw new AppError("DISCOUNT_LIMIT_LOAD_FAILED", "Не удалось загрузить лимит скидки.");
  const parsed = z.coerce.number().safeParse(data);
  if (!parsed.success) throw new AppError("INVALID_DISCOUNT_LIMIT_DATA", "Получен некорректный лимит скидки.");
  return parsed.data;
}

export async function listDiscountRoleLimits(): Promise<DiscountRoleLimit[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_discount_role_limits", {
    org_id: context.organization.id,
  });
  if (error) throw new AppError("DISCOUNT_ROLE_LIMITS_LOAD_FAILED", "Не удалось загрузить ролевые лимиты скидок.");
  const parsed = z.array(discountRoleLimitRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_DISCOUNT_ROLE_LIMIT_DATA", "Получены некорректные ролевые лимиты.");
  return parsed.data.map((row) => ({
    roleId: row.role_id,
    roleCode: row.role_code,
    roleName: row.role_name,
    maxDiscountPercent: row.max_discount_percent,
  }));
}

export async function listInvoiceDiscountApplications(invoiceId: string): Promise<DiscountApplication[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_invoice_discount_applications", {
    org_id: context.organization.id,
    target_invoice_id: invoiceId,
  });
  if (error) throw new AppError("DISCOUNT_APPLICATIONS_LOAD_FAILED", "Не удалось загрузить историю скидок.");
  const parsed = z.array(discountApplicationRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_DISCOUNT_APPLICATION_DATA", "Получена некорректная история скидок.");
  return parsed.data.map((row) => ({
    id: row.id,
    discountId: row.discount_id,
    discountName: row.discount_name,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    amountBefore: row.amount_before,
    discountAmount: row.discount_amount,
    amountAfter: row.amount_after,
    reason: row.reason,
    appliedByName: row.applied_by_name,
    appliedAt: row.applied_at,
  }));
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payment_methods", { org_id: context.organization.id });
  if (error) throw new AppError("PAYMENT_METHODS_LOAD_FAILED", "Не удалось загрузить способы оплаты.");
  const parsed = z.array(paymentMethodRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_PAYMENT_METHOD_DATA", "Получены некорректные способы оплаты.");
  return parsed.data.map((row) => ({ id: row.id, code: row.code, name: row.name, isActive: row.is_active }));
}

export async function listCashDesks(): Promise<CashDeskState[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_cash_desks", { org_id: context.organization.id });
  if (error) throw new AppError("CASH_DESKS_LOAD_FAILED", "Не удалось загрузить кассы.");
  const parsed = z.array(cashDeskRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_CASH_DESK_DATA", "Получены некорректные данные касс.");
  return parsed.data.map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    name: row.name,
    isActive: row.is_active,
    openShiftId: row.open_shift_id,
    openedAt: row.opened_at,
    openedByName: row.opened_by_name,
    openingBalance: row.opening_balance,
    cashPaymentsTotal: row.cash_payments_total,
    cashRefundsTotal: row.cash_refunds_total,
    expectedCashBalance: row.expected_cash_balance,
  }));
}

export async function listPayments(patientId?: string): Promise<PaymentListItem[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payments", {
    org_id: context.organization.id,
    target_patient_id: patientId ?? null,
    result_limit: 100,
  });
  if (error) throw new AppError("PAYMENTS_LOAD_FAILED", "Не удалось загрузить платежи.");
  const parsed = z.array(paymentRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_PAYMENT_DATA", "Получены некорректные данные платежей.");
  return parsed.data.map((row) => ({
    id: row.id,
    receiptNumber: row.receipt_number,
    patientId: row.patient_id,
    patientName: row.patient_name,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    branchId: row.branch_id,
    cashDeskName: row.cash_desk_name,
    branchName: row.branch_name,
    cashShiftId: row.cash_shift_id,
    cashShiftStatus: row.cash_shift_status,
    paymentMethodCode: row.payment_method_code,
    paymentMethodName: row.payment_method_name,
    amount: row.amount,
    refundedAmount: row.refunded_amount,
    paidAt: row.paid_at,
    status: row.status,
    externalReference: row.external_reference,
    reversalReason: row.reversal_reason,
  }));
}

export async function listPaymentRefunds(patientId?: string): Promise<PaymentRefundListItem[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payment_refunds", {
    org_id: context.organization.id,
    target_patient_id: patientId ?? null,
    result_limit: 100,
  });
  if (error) throw new AppError("PAYMENT_REFUNDS_LOAD_FAILED", "Не удалось загрузить возвраты.");
  const parsed = z.array(paymentRefundRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_PAYMENT_REFUND_DATA", "Получены некорректные данные возвратов.");
  return parsed.data.map((row) => ({
    id: row.id,
    refundNumber: row.refund_number,
    paymentId: row.payment_id,
    receiptNumber: row.receipt_number,
    patientId: row.patient_id,
    patientName: row.patient_name,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    cashDeskName: row.cash_desk_name,
    branchName: row.branch_name,
    paymentMethodName: row.payment_method_name,
    amount: row.amount,
    reason: row.reason,
    externalReference: row.external_reference,
    refundedAt: row.refunded_at,
  }));
}

export async function listPatientLedger(patientId: string): Promise<PatientLedgerEntry[]> {
  const context = await requirePermission("finance.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_patient_ledger", {
    org_id: context.organization.id,
    target_patient_id: patientId,
    result_limit: 200,
  });
  if (error) throw new AppError("PATIENT_LEDGER_LOAD_FAILED", "Не удалось загрузить лицевой счёт пациента.");
  const parsed = z.array(ledgerRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_LEDGER_DATA", "Получены некорректные проводки пациента.");
  return parsed.data.map((row) => ({
    id: row.id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    paymentId: row.payment_id,
    entryType: row.entry_type,
    debitAmount: row.debit_amount,
    creditAmount: row.credit_amount,
    description: row.description,
    occurredAt: row.occurred_at,
  }));
}
