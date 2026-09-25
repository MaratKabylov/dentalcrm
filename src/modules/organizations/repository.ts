import { cookies } from "next/headers";
import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { hasPermission, isWritePermission } from "@/lib/permissions/catalog";
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
  access_until: z.string(),
  suspension_reason: z.string().nullable(),
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
       organizations!inner(id, name, timezone, currency, locale, status, access_until, suspension_reason),
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

    const organization = parsed.data.organizations;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: organization.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const accessState = organization.status === "archived"
      ? "archived"
      : organization.status === "suspended"
        ? "suspended"
        : organization.access_until < today
          ? "expired"
          : "active";

    return {
      membershipId: parsed.data.id,
      organization: {
        id: organization.id,
        name: organization.name,
        timezone: organization.timezone,
        currency: organization.currency,
        locale: organization.locale,
        status: organization.status,
        accessUntil: organization.access_until,
        accessState,
        suspensionReason: organization.suspension_reason,
        isReadOnly: accessState !== "active",
      },
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
    can: (permission) =>
      hasPermission(selected.permissions, permission) &&
      (!selected.organization.isReadOnly || !isWritePermission(permission)),
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
