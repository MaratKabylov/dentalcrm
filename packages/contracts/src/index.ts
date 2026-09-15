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

const codeSchema = z.string().trim().min(1).max(32).regex(/^[a-z0-9-]+$/);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const dateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid ISO date-time");

export const createRoomSchema = z.object({
  branchId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(120)
});

export const createChairSchema = z.object({
  branchId: uuidSchema,
  roomId: uuidSchema.optional(),
  code: codeSchema,
  name: z.string().trim().min(1).max(120)
});

export const createEmployeeSchema = z.object({
  branchIds: z.array(uuidSchema).min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  middleName: optionalText(80),
  phone: optionalText(32),
  email: z.email().optional(),
  doctor: z.object({ specialty: optionalText(120), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).optional()
});

export const createServiceSchema = z.object({
  categoryId: uuidSchema.optional(),
  code: codeSchema,
  name: z.string().trim().min(1).max(180),
  durationMinutes: z.number().int().min(5).max(720)
});

export const createPriceListSchema = z.object({
  branchId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(160),
  currency: z.string().trim().length(3).default("KZT"),
  validFrom: z.string().date(),
  validTo: z.string().date().optional(),
  items: z.array(z.object({ serviceId: uuidSchema, priceMinor: z.number().int().nonnegative() })).min(1)
});

export const createPatientSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  middleName: optionalText(80),
  birthDate: z.string().date().optional(),
  sex: z.enum(["female", "male", "unknown"]).default("unknown"),
  phone: z.string().trim().min(5).max(32),
  email: z.email().optional(),
  notes: optionalText(4000)
});

export const updatePatientSchema = createPatientSchema.partial().refine((value) => Object.keys(value).length > 0);

export const appointmentStatuses = [
  "created", "awaiting_confirmation", "confirmed", "checked_in", "in_progress",
  "completed", "cancelled", "no_show", "rescheduled"
] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];

export const createAppointmentSchema = z.object({
  patientId: uuidSchema,
  doctorId: uuidSchema,
  branchId: uuidSchema,
  roomId: uuidSchema.optional(),
  chairId: uuidSchema.optional(),
  startsAt: dateTimeSchema,
  endsAt: dateTimeSchema,
  source: z.enum(["phone", "web", "walk_in", "internal"]).default("internal"),
  reason: optionalText(500),
  notes: optionalText(4000),
  serviceIds: z.array(uuidSchema).default([])
}).refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
  message: "endsAt must be later than startsAt",
  path: ["endsAt"]
});

export const appointmentRangeSchema = z.object({
  from: dateTimeSchema,
  to: dateTimeSchema
}).refine((value) => Date.parse(value.to) > Date.parse(value.from), { message: "to must be later than from" });

export const transitionAppointmentSchema = z.object({ reason: optionalText(500) });

export const createScheduleShiftSchema = z.object({
  branchId: uuidSchema,
  doctorId: uuidSchema,
  startsAt: dateTimeSchema,
  endsAt: dateTimeSchema
}).refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
  message: "endsAt must be later than startsAt",
  path: ["endsAt"]
});

export const rescheduleAppointmentSchema = z.object({
  startsAt: dateTimeSchema,
  endsAt: dateTimeSchema,
  roomId: uuidSchema.nullable().optional(),
  chairId: uuidSchema.nullable().optional(),
  reason: z.string().trim().min(1).max(500)
}).refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
  message: "endsAt must be later than startsAt",
  path: ["endsAt"]
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type CreateChairInput = z.infer<typeof createChairSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type CreatePriceListInput = z.infer<typeof createPriceListSchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type CreateScheduleShiftInput = z.infer<typeof createScheduleShiftSchema>;
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

export interface PatientDto extends CreatePatientInput {
  id: string;
  createdAt: string;
}

export interface AppointmentDto {
  id: string;
  patientId: string;
  doctorId: string;
  branchId: string;
  roomId: string | null;
  chairId: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: string;
  reason: string | null;
  notes: string | null;
}
