import { cookies } from "next/headers";
import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { hasPermission, isWritePermission } from "@/lib/permissions/catalog";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/repository";
import type {
  BranchAccessSummary,
  OrganizationContext,
  OrganizationMembership,
} from "@/modules/organizations/types";

export const ACTIVE_ORGANIZATION_COOKIE = "dental-active-organization";
export const ACTIVE_BRANCH_COOKIE = "dental-active-branch";

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
  primary_branch_id: z.uuid().nullable(),
  has_all_branch_access: z.boolean(),
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

const branchAccessRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  timezone: z.string(),
  is_active: z.boolean(),
  is_primary: z.boolean(),
});

export async function listCurrentUserMemberships(userId?: string): Promise<
  OrganizationMembership[]
> {
  const resolvedUserId = userId ?? (await requireUser()).id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select(
      `id, organization_id, primary_branch_id, has_all_branch_access,
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

  const parsedMemberships = (data ?? []).map((row) => {
    const parsed = membershipRowSchema.safeParse(row);
    if (!parsed.success) {
      throw new AppError(
        "INVALID_MEMBERSHIP_DATA",
        "Получена некорректная конфигурация доступа.",
      );
    }

    return parsed.data;
  });

  const branchResults = await Promise.all(
    parsedMemberships.map((membership) =>
      supabase.rpc("list_current_user_branch_access", {
        org_id: membership.organization_id,
      }),
    ),
  );

  return parsedMemberships.map((membership, index) => {
    const branchResult = branchResults[index];
    if (branchResult.error) {
      throw new AppError(
        "BRANCH_ACCESS_LOAD_FAILED",
        "Не удалось загрузить доступные филиалы.",
      );
    }

    const parsedBranches = z.array(branchAccessRowSchema).safeParse(branchResult.data ?? []);
    if (!parsedBranches.success) {
      throw new AppError(
        "INVALID_BRANCH_ACCESS_DATA",
        "Получены некорректные данные доступа к филиалам.",
      );
    }

    const roles = membership.member_roles.map(({ roles: role }) => ({
      code: role.code,
      name: role.name,
    }));
    const permissions = new Set(
      membership.member_roles.flatMap(({ roles: role }) =>
        role.role_permissions.map(({ permissions: permission }) => permission.code),
      ),
    );

    const branches: BranchAccessSummary[] = parsedBranches.data.map((branch) => ({
      id: branch.id,
      name: branch.name,
      address: branch.address,
      timezone: branch.timezone,
      isActive: branch.is_active,
      isPrimary: branch.is_primary,
    }));

    const organization = membership.organizations;
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
      membershipId: membership.id,
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
      primaryBranchId: membership.primary_branch_id,
      hasAllBranchAccess: membership.has_all_branch_access,
      branches,
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
  const requestedBranchId = cookieStore.get(ACTIVE_BRANCH_COOKIE)?.value;
  const activeBranch =
    selected.branches.find((branch) => branch.id === requestedBranchId && branch.isActive) ??
    selected.branches.find((branch) => branch.id === selected.primaryBranchId && branch.isActive) ??
    selected.branches.find((branch) => branch.isActive) ??
    selected.branches[0] ??
    null;

  return {
    ...selected,
    activeBranchId: activeBranch?.id ?? null,
    activeBranch,
    can: (permission) =>
      hasPermission(selected.permissions, permission) &&
      (!selected.organization.isReadOnly || !isWritePermission(permission)),
    canAccessBranch: (branchId) =>
      selected.branches.some((branch) => branch.id === branchId),
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

export async function requireBranchPermission(
  permission: Parameters<typeof hasPermission>[1],
  branchId: string,
) {
  const context = await requirePermission(permission);

  if (!context.canAccessBranch(branchId)) {
    throw new AppError(
      "BRANCH_FORBIDDEN",
      "У вас нет доступа к данным этого филиала.",
    );
  }

  return context;
}
