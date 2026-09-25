import { z } from "zod";

export const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Введите корректный email.")),
  roleId: z.uuid("Выберите роль."),
});

export const invitationIdSchema = z.uuid();

export const updateMemberRoleSchema = z.object({
  membershipId: z.uuid(),
  roleId: z.uuid("Выберите роль."),
});

export const updateMemberStatusSchema = z.object({
  membershipId: z.uuid(),
  status: z.enum(["active", "suspended", "removed"]),
});

export const invitationTokenSchema = z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/);

