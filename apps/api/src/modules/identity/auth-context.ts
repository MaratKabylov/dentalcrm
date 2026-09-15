export interface AuthContext {
  tenantId: string;
  userId: string;
  membershipId: string;
  subject: string;
  permissions: ReadonlySet<string>;
  requestId: string;
}
