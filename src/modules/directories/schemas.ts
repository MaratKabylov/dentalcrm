import { z } from "zod";

import { DIRECTORY_KINDS } from "./types";

const optionalUuid = z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional());

export const saveDirectoryEntrySchema = z.object({
  entryId: optionalUuid,
  kind: z.enum(DIRECTORY_KINDS),
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,60}$/),
  name: z.string().trim().min(2).max(160),
  color: z.preprocess((value) => value === "" ? null : value, z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable()),
  scope: z.enum(["organization", "branch"]),
  branchId: optionalUuid,
  sortOrder: z.coerce.number().int().min(0).max(10000),
}).superRefine((value, context) => {
  if (value.scope === "branch" && !value.branchId) context.addIssue({ code: "custom", path: ["branchId"], message: "Выберите филиал." });
  if (value.scope === "organization" && value.branchId) context.addIssue({ code: "custom", path: ["branchId"], message: "Для общего значения филиал не указывается." });
});

export const setDirectoryEntryActiveSchema = z.object({
  entryId: z.uuid(),
  kind: z.enum(DIRECTORY_KINDS),
  scope: z.enum(["organization", "branch"]),
  branchId: optionalUuid,
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
}).superRefine((value, context) => {
  if (value.scope === "branch" && !value.branchId) context.addIssue({ code: "custom", path: ["branchId"], message: "Выберите филиал." });
  if (value.scope === "organization" && value.branchId) context.addIssue({ code: "custom", path: ["branchId"], message: "Для общего значения филиал не указывается." });
});
