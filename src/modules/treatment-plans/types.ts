export type TreatmentPlanStatus = "draft" | "proposed" | "approved" | "rejected" | "in_progress" | "completed" | "cancelled";

export type TreatmentPlanItem = {
  id: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  toothCode: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  amount: number;
  priority: number;
  plannedOrder: number;
  status: "planned" | "approved" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
};

export type TreatmentPlanVersion = {
  id: string;
  versionNo: number;
  title: string;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  createdAt: string;
};

export type TreatmentPlan = {
  id: string;
  patientId: string;
  patientName: string;
  patientExternalNumber: string;
  doctorId: string;
  doctorName: string;
  status: TreatmentPlanStatus;
  title: string;
  currentVersionNo: number;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  items: TreatmentPlanItem[];
  versions: TreatmentPlanVersion[];
};

export type TreatmentPlanListItem = Pick<TreatmentPlan,
  "id" | "doctorName" | "status" | "title" | "currentVersionNo" |
  "totalAmount" | "discountAmount" | "finalAmount" | "createdAt" | "updatedAt"
>;
