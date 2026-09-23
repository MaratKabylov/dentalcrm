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
