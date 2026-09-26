import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { DIRECTORY_KINDS, type DirectoryManagementData } from "./types";

const rowSchema = z.object({
  id: z.uuid(), kind: z.enum(DIRECTORY_KINDS), code: z.string(), name: z.string(),
  color: z.string().nullable(), scope: z.enum(["organization", "branch"]),
  branch_id: z.uuid().nullable(), branch_name: z.string().nullable(),
  is_active: z.boolean(), is_system: z.boolean(), sort_order: z.coerce.number().int(),
  usage_count: z.coerce.number().int().min(0),
});

export async function getDirectoryManagementData(): Promise<DirectoryManagementData> {
  const context = await getOrganizationContext();
  if (!context || (!context.can("directories.manage_global") && !context.can("directories.manage_branch"))) {
    throw new AppError("FORBIDDEN", "Недостаточно прав для управления справочниками.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_directory_entries", { org_id: context.organization.id });
  if (error) throw new AppError("DIRECTORIES_LOAD_FAILED", "Не удалось загрузить справочники.");
  const parsed = z.array(rowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_DIRECTORY_DATA", "Получены некорректные справочники.");
  return {
    entries: parsed.data.map((row) => ({ id: row.id, kind: row.kind, code: row.code, name: row.name,
      color: row.color, scope: row.scope, branchId: row.branch_id, branchName: row.branch_name,
      isActive: row.is_active, isSystem: row.is_system, sortOrder: row.sort_order, usageCount: row.usage_count })),
    branches: context.branches.filter((branch) => branch.isActive).map((branch) => ({ id: branch.id, name: branch.name })),
    canManageGlobal: context.can("directories.manage_global"),
    canManageBranch: context.can("directories.manage_branch"),
  };
}
