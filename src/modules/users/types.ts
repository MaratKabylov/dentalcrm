import type { FormActionState } from "@/modules/auth/types";

export type OrganizationMember = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  status: "active" | "suspended";
  joinedAt: string;
  lastSignInAt: string | null;
  roleId: string | null;
  roleCode: string | null;
  roleName: string | null;
};

export type OrganizationInvitation = {
  invitationId: string;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
  roleId: string;
  roleCode: string;
  roleName: string;
};

export type OrganizationRole = {
  roleId: string;
  code: string;
  name: string;
  isSystem: boolean;
  permissionCodes: string[];
};

export type UserManagementAuditLog = {
  id: string;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  targetLabel: string;
  occurredAt: string;
};

export type UserManagementData = {
  members: OrganizationMember[];
  invitations: OrganizationInvitation[];
  roles: OrganizationRole[];
  auditLogs: UserManagementAuditLog[];
  currentUserId: string;
  organizationName: string;
};

export type InvitationSummary = {
  organizationId: string;
  organizationName: string;
  email: string;
  roleName: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
};

export type UserActionState = FormActionState & {
  invitationUrl?: string;
};

