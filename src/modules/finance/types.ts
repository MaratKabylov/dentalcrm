export type InvoiceStatus = "issued" | "partially_paid" | "paid";

export type BillableEncounter = {
  encounterId: string;
  patientId: string;
  patientName: string;
  patientExternalNumber: string;
  doctorName: string;
  branchName: string;
  closedAt: string;
  procedureCount: number;
  totalAmount: number;
};

export type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  patientExternalNumber: string;
  branchName: string;
  encounterId: string | null;
  status: InvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  issuedAt: string;
};

export type InvoiceDetails = InvoiceListItem & {
  branchId: string;
  subtotal: number;
  discountAmount: number;
};

export type InvoiceItem = {
  id: string;
  serviceId: string | null;
  performedServiceId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  amount: number;
};

export type InvoiceSummary = {
  invoiceCount: number;
  totalAmount: number;
  debtAmount: number;
};

export type PaymentMethod = {
  id: string;
  code: "cash" | "card" | "kaspi" | "bank_transfer" | "other";
  name: string;
  isActive: boolean;
};

export type CashDeskState = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  isActive: boolean;
  openShiftId: string | null;
  openedAt: string | null;
  openedByName: string | null;
  openingBalance: number | null;
  cashPaymentsTotal: number;
  expectedCashBalance: number | null;
};

export type PaymentListItem = {
  id: string;
  receiptNumber: string;
  patientId: string;
  patientName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  cashDeskName: string;
  branchName: string;
  paymentMethodCode: PaymentMethod["code"];
  paymentMethodName: string;
  amount: number;
  paidAt: string;
  status: "posted" | "reversed";
  externalReference: string | null;
};

export type PatientLedgerEntry = {
  id: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  paymentId: string | null;
  entryType: "charge" | "payment" | "refund" | "adjustment";
  debitAmount: number;
  creditAmount: number;
  description: string;
  occurredAt: string;
};
