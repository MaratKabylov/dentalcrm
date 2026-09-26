import type { PermissionCode } from "@/lib/permissions/catalog";

export type OrganizationSummary = {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  locale: string;
  status: string;
  accessUntil: string;
  accessState: "active" | "expired" | "suspended" | "archived";
  suspensionReason: string | null;
  isReadOnly: boolean;
};

export type BranchAccessSummary = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  isActive: boolean;
  isPrimary: boolean;
};

export type OrganizationMembership = {
  membershipId: string;
  organization: OrganizationSummary;
  roles: Array<{ code: string; name: string }>;
  permissions: ReadonlySet<string>;
  primaryBranchId: string | null;
  hasAllBranchAccess: boolean;
  branches: BranchAccessSummary[];
};

export type OrganizationContext = OrganizationMembership & {
  activeBranchId: string | null;
  activeBranch: BranchAccessSummary | null;
  can(permission: PermissionCode): boolean;
  canAccessBranch(branchId: string): boolean;
};
