import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/repository";
import type { PlatformAdminAuditLog, PlatformOrganization } from "@/modules/platform-admin/types";

const organizationRowSchema = z.object({
  organization_id: z.uuid(),
  organization_name: z.string(),
  legal_name: z.string().nullable(),
  bin: z.string().nullable(),
  timezone: z.string(),
  organization_status: z.string(),
  access_until: z.string(),
  access_state: z.enum(["active", "expired", "suspended", "archived"]),
  suspension_reason: z.string().nullable(),
  member_count: z.coerce.number().int().nonnegative(),
  owner_name: z.string().nullable(),
  owner_email: z.string().nullable(),
  created_at: z.string(),
  last_activity_at: z.string().nullable(),
});

const auditRowSchema = z.object({
  audit_id: z.uuid(),
  organization_id: z.uuid(),
  organization_name: z.string(),
  actor_name: z.string().nullable(),
  actor_email: z.string().nullable(),
  action: z.enum(["access.updated", "access.suspended", "access.restored"]),
  reason: z.string().nullable(),
  before_data: z.record(z.string(), z.unknown()),
  after_data: z.record(z.string(), z.unknown()),
  occurred_at: z.string(),
});

export const isCurrentUserSuperAdmin = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_user_is_super_admin");

  if (error) {
    throw new AppError("PLATFORM_ROLE_LOAD_FAILED", "Не удалось проверить роль администратора сервиса.");
  }

  return user != null && data === true;
});

export async function requireSuperAdmin() {
  const allowed = await isCurrentUserSuperAdmin();
  if (!allowed) redirect("/dashboard");
}

export async function listPlatformOrganizations(): Promise<PlatformOrganization[]> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_platform_organizations");

  if (error) {
    throw new AppError("ORGANIZATIONS_LOAD_FAILED", "Не удалось загрузить организации.");
  }

  return z.array(organizationRowSchema).parse(data ?? []).map((row) => ({
    id: row.organization_id,
    name: row.organization_name,
    legalName: row.legal_name,
    bin: row.bin,
    timezone: row.timezone,
    status: row.organization_status,
    accessUntil: row.access_until,
    accessState: row.access_state,
    suspensionReason: row.suspension_reason,
    memberCount: row.member_count,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
  }));
}

export async function listPlatformAdminAuditLogs(): Promise<PlatformAdminAuditLog[]> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_platform_admin_audit_logs", {
    result_limit: 20,
  });

  if (error) {
    throw new AppError("ADMIN_AUDIT_LOAD_FAILED", "Не удалось загрузить журнал действий.");
  }

  return z.array(auditRowSchema).parse(data ?? []).map((row) => ({
    id: row.audit_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    action: row.action,
    reason: row.reason,
    beforeData: row.before_data,
    afterData: row.after_data,
    occurredAt: row.occurred_at,
  }));
}
