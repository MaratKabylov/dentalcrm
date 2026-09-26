import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import {
  requireBranchPermission,
  requirePermission,
} from "@/modules/organizations/repository";
import type {
  BranchListItem,
  BranchManagementDetail,
  BranchMemberAccess,
  BranchRoom,
  BranchWorkingHour,
} from "@/modules/branches/types";

const branchListRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  timezone: z.string(),
  is_active: z.boolean(),
  rooms_count: z.coerce.number().int().min(0),
  employees_count: z.coerce.number().int().min(0),
});

const branchRowSchema = branchListRowSchema.omit({
  rooms_count: true,
  employees_count: true,
});

const workingHourRowSchema = z.object({
  weekday: z.coerce.number().int().min(1).max(7),
  is_working: z.boolean(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
});

const roomRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  is_active: z.boolean(),
});

const memberRowSchema = z.object({
  membership_id: z.uuid(),
  user_id: z.uuid(),
  full_name: z.string(),
  email: z.string(),
  role_code: z.string().nullable(),
  role_name: z.string().nullable(),
  has_all_branch_access: z.boolean(),
  has_branch_access: z.boolean(),
  is_primary: z.boolean(),
});

function mapBranch(row: z.infer<typeof branchListRowSchema>): BranchListItem {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    timezone: row.timezone,
    isActive: row.is_active,
    roomsCount: row.rooms_count,
    employeesCount: row.employees_count,
  };
}

export async function listBranchesForManagement(): Promise<BranchListItem[]> {
  const context = await requirePermission("branches.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_branches_for_management", {
    org_id: context.organization.id,
  });
  if (error) {
    throw new AppError("BRANCHES_LOAD_FAILED", "Не удалось загрузить филиалы.");
  }
  const parsed = z.array(branchListRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new AppError("INVALID_BRANCH_DATA", "Получены некорректные данные филиалов.");
  }
  return parsed.data.map(mapBranch);
}

export async function getBranchManagementDetail(
  branchId: string,
): Promise<BranchManagementDetail | null> {
  const context = await requireBranchPermission("branches.manage", branchId);
  const supabase = await createClient();
  const canManageRooms = context.can("directories.manage_branch");
  const canManageAccess = context.can("branch_access.manage");

  const [branchResult, hoursResult, roomsResult, membersResult] = await Promise.all([
    supabase.rpc("get_branch_for_management", {
      org_id: context.organization.id,
      target_branch_id: branchId,
    }),
    supabase.rpc("list_branch_working_hours_for_management", {
      org_id: context.organization.id,
      target_branch_id: branchId,
    }),
    canManageRooms
      ? supabase.rpc("list_branch_rooms_for_management", {
          org_id: context.organization.id,
          target_branch_id: branchId,
        })
      : Promise.resolve({ data: [], error: null }),
    canManageAccess
      ? supabase.rpc("list_branch_members_for_management", {
          org_id: context.organization.id,
          target_branch_id: branchId,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (branchResult.error || hoursResult.error || roomsResult.error || membersResult.error) {
    throw new AppError("BRANCH_LOAD_FAILED", "Не удалось загрузить настройки филиала.");
  }

  const branchRows = z.array(branchRowSchema).safeParse(branchResult.data ?? []);
  const hours = z.array(workingHourRowSchema).safeParse(hoursResult.data ?? []);
  const rooms = z.array(roomRowSchema).safeParse(roomsResult.data ?? []);
  const members = z.array(memberRowSchema).safeParse(membersResult.data ?? []);
  if (!branchRows.success || !hours.success || !rooms.success || !members.success) {
    throw new AppError("INVALID_BRANCH_DATA", "Получены некорректные настройки филиала.");
  }

  const branch = branchRows.data[0];
  if (!branch) return null;

  return {
    branch: {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      email: branch.email,
      timezone: branch.timezone,
      isActive: branch.is_active,
    },
    workingHours: hours.data.map((row): BranchWorkingHour => ({
      weekday: row.weekday,
      isWorking: row.is_working,
      startTime: row.start_time?.slice(0, 5) ?? null,
      endTime: row.end_time?.slice(0, 5) ?? null,
    })),
    rooms: rooms.data.map((row): BranchRoom => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
    })),
    members: members.data.map((row): BranchMemberAccess => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      roleCode: row.role_code,
      roleName: row.role_name,
      hasAllBranchAccess: row.has_all_branch_access,
      hasBranchAccess: row.has_branch_access,
      isPrimary: row.is_primary,
    })),
    canManageRooms,
    canManageAccess,
    canManageAllBranchAccess: canManageAccess && context.hasAllBranchAccess,
  };
}
