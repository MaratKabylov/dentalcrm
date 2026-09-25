export type OrganizationAccessState = "active" | "expired" | "suspended" | "archived";

export type PlatformOrganization = {
  id: string;
  name: string;
  legalName: string | null;
  bin: string | null;
  timezone: string;
  status: string;
  accessUntil: string;
  accessState: OrganizationAccessState;
  suspensionReason: string | null;
  memberCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  lastActivityAt: string | null;
};

export type PlatformAdminAuditLog = {
  id: string;
  organizationId: string;
  organizationName: string;
  actorName: string | null;
  actorEmail: string | null;
  action: "access.updated" | "access.suspended" | "access.restored";
  reason: string | null;
  beforeData: Record<string, unknown>;
  afterData: Record<string, unknown>;
  occurredAt: string;
};
