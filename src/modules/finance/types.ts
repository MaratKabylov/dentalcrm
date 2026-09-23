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
  cashRefundsTotal: number;
  expectedCashBalance: number | null;
};

export type PaymentListItem = {
  id: string;
  receiptNumber: string;
  patientId: string;
  patientName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  branchId: string;
  cashDeskName: string;
  branchName: string;
  cashShiftId: string;
  cashShiftStatus: "open" | "closed";
  paymentMethodCode: PaymentMethod["code"];
  paymentMethodName: string;
  amount: number;
  refundedAmount: number;
  paidAt: string;
  status: "posted" | "partially_refunded" | "refunded" | "reversed";
  externalReference: string | null;
  reversalReason: string | null;
};

export type PaymentRefundListItem = {
  id: string;
  refundNumber: string;
  paymentId: string;
  receiptNumber: string;
  patientId: string;
  patientName: string;
  invoiceId: string;
  invoiceNumber: string;
  cashDeskName: string;
  branchName: string;
  paymentMethodName: string;
  amount: number;
  reason: string;
  externalReference: string | null;
  refundedAt: string;
};

export type PatientLedgerEntry = {
  id: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  paymentId: string | null;
  entryType: "charge" | "payment" | "refund" | "reversal" | "adjustment";
  debitAmount: number;
  creditAmount: number;
  description: string;
  occurredAt: string;
};
