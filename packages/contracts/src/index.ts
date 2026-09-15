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

export const encounterStatuses = ["in_progress", "completed", "cancelled"] as const;
export type EncounterStatus = (typeof encounterStatuses)[number];
export const clinicalNoteStatuses = ["draft", "signed", "amended"] as const;
export type ClinicalNoteStatus = (typeof clinicalNoteStatuses)[number];

export const createEncounterSchema = z.object({
  patientId: uuidSchema,
  doctorId: uuidSchema,
  branchId: uuidSchema,
  appointmentId: uuidSchema.optional(),
  startedAt: dateTimeSchema.optional()
});

export const createClinicalNoteSchema = z.object({
  encounterId: uuidSchema,
  title: z.string().trim().min(1).max(180).default("Clinical note"),
  content: z.string().trim().min(1).max(100_000)
});

export const updateClinicalNoteSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  content: z.string().trim().min(1).max(100_000).optional()
}).refine((value) => Object.keys(value).length > 0);

export const amendClinicalNoteSchema = z.object({
  content: z.string().trim().min(1).max(100_000),
  reason: z.string().trim().min(3).max(1000)
});

export const createDiagnosisSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(500),
  kind: z.enum(["primary", "secondary", "differential"]).default("primary"),
  toothNumber: z.number().int().min(11).max(85).optional()
});

export const createProcedureSchema = z.object({
  serviceId: uuidSchema,
  treatmentPlanItemId: uuidSchema.optional(),
  toothNumber: z.number().int().min(11).max(85).optional(),
  quantity: z.number().int().min(1).max(100).default(1),
  notes: optionalText(4000)
});

export const completeProcedureSchema = z.object({ completedAt: dateTimeSchema.optional() });

export const toothSurfaces = ["whole", "occlusal", "mesial", "distal", "buccal", "lingual", "root"] as const;
export const setOdontogramEntrySchema = z.object({
  encounterId: uuidSchema.optional(),
  doctorId: uuidSchema,
  toothNumber: z.number().int().min(11).max(85),
  surface: z.enum(toothSurfaces),
  conditionCode: z.string().trim().min(1).max(64),
  status: z.enum(["active", "resolved"]).default("active"),
  observedAt: dateTimeSchema.optional()
});

const treatmentPlanItemSchema = z.object({
  serviceId: uuidSchema,
  doctorId: uuidSchema.optional(),
  toothNumber: z.number().int().min(11).max(85).optional(),
  quantity: z.number().int().min(1).max(100).default(1),
  listPriceMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative().default(0),
  finalPriceMinor: z.number().int().nonnegative()
}).refine((value) => value.discountMinor <= value.listPriceMinor * value.quantity, {
  message: "discountMinor exceeds gross amount", path: ["discountMinor"]
}).refine((value) => value.finalPriceMinor === value.listPriceMinor * value.quantity - value.discountMinor, {
  message: "finalPriceMinor must equal gross amount minus discountMinor", path: ["finalPriceMinor"]
});

export const createTreatmentPlanSchema = z.object({
  patientId: uuidSchema,
  title: z.string().trim().min(1).max(180),
  currency: z.string().trim().length(3).default("KZT"),
  items: z.array(treatmentPlanItemSchema).min(1)
});

export const acceptTreatmentPlanSchema = z.object({
  itemIds: z.array(uuidSchema).min(1),
  acceptedBy: z.enum(["patient", "representative"]).default("patient")
});

export const createDocumentSchema = z.object({
  patientId: uuidSchema,
  encounterId: uuidSchema.optional(),
  kind: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(127),
  storageKey: z.string().trim().min(1).max(1024),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i)
});

export const signDocumentSchema = z.object({
  signerType: z.enum(["patient", "employee", "eds"]),
  signerId: uuidSchema.optional(),
  signatureReference: optionalText(2048)
});

export type CreateEncounterInput = z.infer<typeof createEncounterSchema>;
export type CreateClinicalNoteInput = z.infer<typeof createClinicalNoteSchema>;
export type UpdateClinicalNoteInput = z.infer<typeof updateClinicalNoteSchema>;
export type AmendClinicalNoteInput = z.infer<typeof amendClinicalNoteSchema>;
export type CreateDiagnosisInput = z.infer<typeof createDiagnosisSchema>;
export type CreateProcedureInput = z.infer<typeof createProcedureSchema>;
export type SetOdontogramEntryInput = z.infer<typeof setOdontogramEntrySchema>;
export type CreateTreatmentPlanInput = z.infer<typeof createTreatmentPlanSchema>;
export type AcceptTreatmentPlanInput = z.infer<typeof acceptTreatmentPlanSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type SignDocumentInput = z.infer<typeof signDocumentSchema>;
