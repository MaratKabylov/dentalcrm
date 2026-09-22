import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Укажите название клиники").max(120),
  branchName: z.string().trim().min(2, "Укажите название филиала").max(120),
});

export const organizationIdSchema = z.uuid();
