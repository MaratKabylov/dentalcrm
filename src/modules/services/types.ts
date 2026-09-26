export type ServiceCategory = {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type TreatmentService = {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  durationMinutes: number;
  basePrice: number;
  costPrice: number | null;
  isActive: boolean;
  vatRate: number | null;
  scope: "organization" | "branch";
  branchId: string | null;
  branchName: string | null;
  networkPrice: number | null;
  priceSource: "organization" | "branch";
};

export type ServiceCatalog = {
  categories: ServiceCategory[];
  services: TreatmentService[];
};
