export interface AuthContext {
  tenantId: string;
  userId: string;
  membershipId: string;
  subject: string;
  permissions: ReadonlySet<string>;
  tenantWide: boolean;
  organizationIds: ReadonlySet<string>;
  branchIds: ReadonlySet<string>;
  requestId: string;
}
