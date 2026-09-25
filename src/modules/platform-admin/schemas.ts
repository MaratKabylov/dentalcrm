import { z } from "zod";

export const updateOrganizationAccessSchema = z.object({
  organizationId: z.uuid(),
  accessUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату окончания доступа"),
  mode: z.enum(["active", "read_only"]),
  reason: z.string().trim().max(500, "Причина слишком длинная").default(""),
}).superRefine((value, context) => {
  if (value.mode === "read_only" && value.reason.length < 3) {
    context.addIssue({
      code: "custom",
      path: ["reason"],
      message: "Укажите причину блокировки",
    });
  }
});
