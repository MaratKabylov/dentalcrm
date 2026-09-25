export type LeadStatus =
  | "new"
  | "contacted"
  | "appointment_booked"
  | "thinking"
  | "lost"
  | "converted";

export type LeadActivityType = "note" | "call" | "email" | "message";

export type PatientSource = {
  id: string;
  code: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
};

export type MarketingCampaign = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceColor: string;
  branchId: string | null;
  branchName: string | null;
  name: string;
  code: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  budgetAmount: number;
  startsOn: string;
  endsOn: string | null;
  isActive: boolean;
};

export type LeadAttribution = {
  campaignId: string | null;
  campaignName: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingPage: string | null;
};

export type MarketingAttributionRow = {
  campaignId: string | null;
  campaignName: string;
  sourceId: string;
  sourceName: string;
  sourceColor: string;
  branchId: string | null;
  branchName: string | null;
  budgetAmount: number;
  leadsCount: number;
  convertedCount: number;
  appointmentsCount: number;
  completedAppointmentsCount: number;
  revenueAmount: number;
};

export type CrmOption = {
  id: string;
  name: string;
};

export type CrmAssignee = {
  id: string;
  fullName: string;
};

export type LeadListItem = {
  id: string;
  branchId: string | null;
  branchName: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  sourceId: string;
  sourceName: string;
  sourceColor: string;
  status: LeadStatus;
  assignedTo: string | null;
  assigneeName: string | null;
  notes: string | null;
  convertedPatientId: string | null;
  activityCount: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadActivity = {
  id: string;
  type: LeadActivityType | "status_change";
  body: string;
  employeeName: string;
  createdAt: string;
};

export type LeadFilters = {
  q?: string;
  status?: LeadStatus | "all";
  source?: string;
  branch?: string;
};

export type MarketingReportFilters = {
  from: string;
  to: string;
  source?: string;
  branch?: string;
};
