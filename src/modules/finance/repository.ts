import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import type {
  BillableEncounter,
  InvoiceDetails,
  InvoiceItem,
  InvoiceListItem,
  InvoiceSummary,
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
