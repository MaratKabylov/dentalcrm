export const DIRECTORY_KINDS = [
  "service_category", "specialization", "employee_position", "room",
  "patient_source", "appointment_cancellation_reason", "payment_method",
  "expense_category", "appointment_status", "patient_tag",
] as const;

export type DirectoryKind = (typeof DIRECTORY_KINDS)[number];

export type DirectoryEntry = {
  id: string;
  kind: DirectoryKind;
  code: string;
  name: string;
  color: string | null;
  scope: "organization" | "branch";
  branchId: string | null;
  branchName: string | null;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  usageCount: number;
};

export type DirectoryManagementData = {
  entries: DirectoryEntry[];
  branches: Array<{ id: string; name: string }>;
  canManageGlobal: boolean;
  canManageBranch: boolean;
};
