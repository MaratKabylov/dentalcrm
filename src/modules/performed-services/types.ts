export type PerformedService = {
  id: string;
  serviceId: string;
  treatmentPlanItemId: string | null;
  serviceCode: string;
  serviceName: string;
  toothCode: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  finalAmount: number;
  notes: string | null;
  performedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  treatmentPlanId: string | null;
  treatmentPlanTitle: string | null;
};

export type AvailableTreatmentPlanItem = {
  treatmentPlanItemId: string;
  treatmentPlanId: string;
  treatmentPlanTitle: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  toothCode: string | null;
  remainingQuantity: number;
  unitPrice: number;
};
