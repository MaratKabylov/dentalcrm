import type { PermissionCode } from "@/lib/permissions/catalog";

export type OrganizationSummary = {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  locale: string;
  status: string;
};

export type OrganizationMembership = {
  membershipId: string;
  organization: OrganizationSummary;
  roles: Array<{ code: string; name: string }>;
  permissions: ReadonlySet<string>;
};

export type OrganizationContext = OrganizationMembership & {
  can(permission: PermissionCode): boolean;
};
