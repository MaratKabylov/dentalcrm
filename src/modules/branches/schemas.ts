import { z } from "zod";

const optionalUuid = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.uuid().optional(),
);

const nullableText = (maximum: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().max(maximum).nullable(),
);

export const branchIdSchema = z.uuid();

export const saveBranchSchema = z.object({
  branchId: optionalUuid,
  name: z.string().trim().min(2, "Укажите название филиала.").max(120),
  address: nullableText(500),
  phone: nullableText(40),
  email: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().toLowerCase().email("Укажите корректный email.").max(200).nullable(),
  ),
  timezone: z.string().trim().min(1, "Укажите часовой пояс.").max(100),
});

export const branchWorkingHoursSchema = z.array(z.object({
  weekday: z.number().int().min(1).max(7),
  isWorking: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
}).superRefine((value, context) => {
  if (!value.isWorking) return;
  if (!value.startTime || !value.endTime || value.endTime <= value.startTime) {
    context.addIssue({
      code: "custom",
      message: "Время окончания должно быть позже времени начала.",
    });
  }
})).length(7);

export const saveRoomSchema = z.object({
  branchId: z.uuid(),
  roomId: optionalUuid,
  name: z.string().trim().min(1, "Укажите название кабинета.").max(100),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const setBranchActiveSchema = z.object({
  branchId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const setMemberBranchAccessSchema = z.object({
  branchId: z.uuid(),
  membershipId: z.uuid(),
  grantAccess: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const setMemberBranchScopeSchema = z.object({
  branchId: z.uuid(),
  membershipId: z.uuid(),
  allowAllBranches: z.enum(["true", "false"]).transform((value) => value === "true"),
});
