export type AnalyticsFilters = {
  from: string;
  to: string;
  branchId?: string;
  doctorId?: string;
  specializationId?: string;
  sourceId?: string;
};

export type AnalyticsOption = { id: string; name: string; color: string | null };

export type AnalyticsFilterOptions = {
  branches: AnalyticsOption[];
  doctors: AnalyticsOption[];
  sources: AnalyticsOption[];
  specializations: AnalyticsOption[];
};

export type ExecutiveAnalytics = {
  revenueAmount: number;
  paymentsAmount: number;
  debtAmount: number;
  appointmentsCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  newPatientsCount: number;
  returningPatientsCount: number;
  averageBill: number;
  treatmentPlansCount: number;
  acceptedPlansCount: number;
  unfinishedPlansCount: number;
  doctorProduction: number;
  materialCost: number;
};

export type DailyAnalyticsPoint = {
  date: string;
  revenueAmount: number;
  paymentsAmount: number;
  productionAmount: number;
};

export type DoctorPerformance = {
  doctorId: string;
  doctorName: string;
  specializationName: string;
  appointmentsCount: number;
  completedCount: number;
  noShowCount: number;
  availableMinutes: number;
  completedMinutes: number;
  productionAmount: number;
  materialCost: number;
};

export type ReceptionPerformance = {
  employeeId: string;
  employeeName: string;
  leadsCount: number;
  convertedLeadsCount: number;
  appointmentsCreated: number;
  completedAppointments: number;
  noShowAppointments: number;
};

export type SourceAnalytics = {
  sourceId: string;
  sourceName: string;
  sourceColor: string;
  leadsCount: number;
  convertedCount: number;
  appointmentsCount: number;
  completedAppointmentsCount: number;
  revenueAmount: number;
  paymentsAmount: number;
};

export type InventoryAnalytics = {
  itemId: string;
  sku: string;
  itemName: string;
  unit: string;
  consumedQuantity: number;
  consumedCost: number;
  writtenOffQuantity: number;
  currentQuantity: number;
  currentValue: number;
  daysOfStock: number | null;
};
