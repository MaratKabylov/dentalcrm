import { cookies } from "next/headers";
import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { hasPermission } from "@/lib/permissions/catalog";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/repository";
import type {
  OrganizationContext,
  OrganizationMembership,
} from "@/modules/organizations/types";

export const ACTIVE_ORGANIZATION_COOKIE = "dental-active-organization";

const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  timezone: z.string(),
  currency: z.string(),
  locale: z.string(),
  status: z.string(),
});

const membershipRowSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  organizations: organizationSchema,
  member_roles: z.array(
    z.object({
      roles: z.object({
        code: z.string(),
        name: z.string(),
        role_permissions: z.array(
          z.object({ permissions: z.object({ code: z.string() }) }),
        ),
      }),
    }),
  ),
});

export async function listCurrentUserMemberships(userId?: string): Promise<
  OrganizationMembership[]
> {
  const resolvedUserId = userId ?? (await requireUser()).id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select(
      `id, organization_id,
       organizations!inner(id, name, timezone, currency, locale, status),
       member_roles(roles!inner(code, name, role_permissions(permissions!inner(code))))`,
    )
    .eq("user_id", resolvedUserId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  if (error) {
    throw new AppError(
      "MEMBERSHIP_LOAD_FAILED",
      "Не удалось загрузить доступные организации.",
    );
  }

  return (data ?? []).map((row) => {
    const parsed = membershipRowSchema.safeParse(row);
    if (!parsed.success) {
      throw new AppError(
        "INVALID_MEMBERSHIP_DATA",
        "Получена некорректная конфигурация доступа.",
      );
    }

    const roles = parsed.data.member_roles.map(({ roles: role }) => ({
      code: role.code,
      name: role.name,
    }));
    const permissions = new Set(
      parsed.data.member_roles.flatMap(({ roles: role }) =>
        role.role_permissions.map(({ permissions: permission }) => permission.code),
      ),
    );

    return {
      membershipId: parsed.data.id,
      organization: parsed.data.organizations,
      roles,
      permissions,
    };
  });
}

export async function getOrganizationContext(
  providedMemberships?: OrganizationMembership[],
): Promise<OrganizationContext | null> {
  const memberships = providedMemberships ?? (await listCurrentUserMemberships());
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const selectedId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  const selected =
    memberships.find(({ organization }) => organization.id === selectedId) ??
    memberships[0];

  return {
    ...selected,
    can: (permission) => hasPermission(selected.permissions, permission),
  };
}

export async function requirePermission(permission: Parameters<typeof hasPermission>[1]) {
  const context = await getOrganizationContext();

  if (!context || !context.can(permission)) {
    throw new AppError(
      "FORBIDDEN",
      "У вас недостаточно прав для выполнения этого действия.",
    );
  }

  return context;
}
