import { z } from "zod";

export const uuidSchema = z.uuid();

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/)
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
    requestId: z.string()
  })
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export interface OrganizationDto {
  id: string;
  name: string;
  code: string;
  createdAt: string;
}
