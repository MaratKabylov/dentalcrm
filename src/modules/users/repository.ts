import { createHash } from "node:crypto";

import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/repository";
import { requirePermission } from "@/modules/organizations/repository";
import type {
  InvitationSummary,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRole,
  UserManagementAuditLog,
  UserManagementData,
} from "@/modules/users/types";

const memberRowSchema = z.object({
  membership_id: z.uuid(),
  user_id: z.uuid(),
  full_name: z.string(),
  email: z.string(),
  status: z.enum(["active", "suspended"]),
  joined_at: z.string(),
  last_sign_in_at: z.string().nullable(),
  role_id: z.uuid().nullable(),
  role_code: z.string().nullable(),
  role_name: z.string().nullable(),
});

const invitationRowSchema = z.object({
  invitation_id: z.uuid(),
  email: z.string(),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expires_at: z.string(),
  created_at: z.string(),
  role_id: z.uuid(),
  role_code: z.string(),
  role_name: z.string(),
});

const roleRowSchema = z.object({
  role_id: z.uuid(),
  code: z.string(),
  name: z.string(),
  is_system: z.boolean(),
  permission_codes: z.array(z.string()),
});

const auditRowSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  actor_name: z.string().nullable(),
  actor_email: z.string().nullable(),
  target_label: z.string(),
  occurred_at: z.string(),
});

const invitationSummaryRowSchema = z.object({
  organization_id: z.uuid(),
  organization_name: z.string(),
  email: z.string(),
  role_name: z.string(),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expires_at: z.string(),
});

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getUserManagementData(): Promise<UserManagementData> {
  const [context, user] = await Promise.all([
    requirePermission("users.manage"),
    requireUser(),
  ]);
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [membersResult, invitationsResult, rolesResult, auditResult] = await Promise.all([
    supabase.rpc("list_organization_members_for_management", { org_id: organizationId }),
    supabase.rpc("list_organization_invitations_for_management", { org_id: organizationId }),
    supabase.rpc("list_organization_roles_for_management", { org_id: organizationId }),
    supabase.rpc("list_user_management_audit", { org_id: organizationId, result_limit: 20 }),
  ]);

  if (membersResult.error || invitationsResult.error || rolesResult.error || auditResult.error) {
    throw new AppError("USER_MANAGEMENT_LOAD_FAILED", "Не удалось загрузить пользователей клиники.");
  }

  const members = z.array(memberRowSchema).safeParse(membersResult.data ?? []);
  const invitations = z.array(invitationRowSchema).safeParse(invitationsResult.data ?? []);
  const roles = z.array(roleRowSchema).safeParse(rolesResult.data ?? []);
  const auditLogs = z.array(auditRowSchema).safeParse(auditResult.data ?? []);
  if (!members.success || !invitations.success || !roles.success || !auditLogs.success) {
    throw new AppError("INVALID_USER_MANAGEMENT_DATA", "Получены некорректные данные пользователей.");
  }

  return {
    currentUserId: user.id,
    organizationName: context.organization.name,
    members: members.data.map((row): OrganizationMember => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      status: row.status,
      joinedAt: row.joined_at,
      lastSignInAt: row.last_sign_in_at,
      roleId: row.role_id,
      roleCode: row.role_code,
      roleName: row.role_name,
    })),
    invitations: invitations.data.map((row): OrganizationInvitation => ({
      invitationId: row.invitation_id,
      email: row.email,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      roleId: row.role_id,
      roleCode: row.role_code,
      roleName: row.role_name,
    })),
    roles: roles.data.map((row): OrganizationRole => ({
      roleId: row.role_id,
      code: row.code,
      name: row.name,
      isSystem: row.is_system,
      permissionCodes: row.permission_codes,
    })),
    auditLogs: auditLogs.data.map((row): UserManagementAuditLog => ({
      id: row.id,
      action: row.action,
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      targetLabel: row.target_label,
      occurredAt: row.occurred_at,
    })),
  };
}

export async function getInvitationSummary(token: string): Promise<InvitationSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inspect_organization_invitation", {
    invite_token_hash: hashInvitationToken(token),
  });
  if (error) throw new AppError("INVITATION_LOAD_FAILED", "Не удалось проверить приглашение.");

  const parsed = z.array(invitationSummaryRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_INVITATION_DATA", "Получены некорректные данные приглашения.");
  const row = parsed.data[0];
  return row ? {
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    email: row.email,
    roleName: row.role_name,
    status: row.status,
    expiresAt: row.expires_at,
  } : null;
}

