export type CompensationRuleType = "percent_revenue" | "fixed_per_service" | "percent_margin";

export type CompensationReference = { id: string; parentId: string | null; code: string | null; name: string; isActive: boolean };

export type CompensationReferenceData = {
  doctors: CompensationReference[];
  services: CompensationReference[];
  categories: CompensationReference[];
};

export type CompensationRule = {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  ruleType: CompensationRuleType;
  value: number;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
};

export type CompensationReportRow = {
  employeeId: string;
  employeeName: string;
  entriesCount: number;
  revenueAmount: number;
  materialCostAmount: number;
  compensationAmount: number;
};

export type CompensationEntry = {
  id: string;
  employeeName: string;
  serviceName: string;
  quantity: number;
  ruleType: CompensationRuleType;
  ruleValue: number;
  revenueAmount: number;
  materialCostAmount: number;
  calculationBase: number;
  compensationAmount: number;
  performedAt: string;
  postedAt: string;
};
