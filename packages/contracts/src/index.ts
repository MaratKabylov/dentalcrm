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
  organizationId: uuidSchema,
  categoryId: uuidSchema.optional(),
  code: codeSchema,
  name: z.string().trim().min(1).max(180),
  durationMinutes: z.number().int().min(5).max(720)
});

export const createPriceListSchema = z.object({
  organizationId: uuidSchema,
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
  organizationId: uuidSchema,
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

export const currencySchema = z.string().trim().length(3).transform((value) => value.toUpperCase());
export const moneyMinorSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const idempotencyKeySchema = z.string().trim().min(8).max(128);

export const createChargeSchema = z.object({
  patientId: uuidSchema,
  branchId: uuidSchema,
  encounterId: uuidSchema.optional(),
  currency: currencySchema.default("KZT"),
  description: optionalText(500),
  items: z.array(z.object({
    serviceId: uuidSchema.optional(),
    procedureId: uuidSchema.optional(),
    description: z.string().trim().min(1).max(500),
    quantity: z.number().int().min(1).max(1000).default(1),
    unitPriceMinor: moneyMinorSchema
  })).min(1)
});

export const paymentMethods = ["cash", "card", "bank_transfer", "kaspi", "deposit"] as const;
export const createPaymentSchema = z.object({
  patientId: uuidSchema,
  branchId: uuidSchema,
  currency: currencySchema.default("KZT"),
  note: optionalText(500),
  parts: z.array(z.object({
    method: z.enum(paymentMethods),
    amountMinor: moneyMinorSchema,
    cashboxId: uuidSchema.optional(),
    depositId: uuidSchema.optional(),
    reference: optionalText(255)
  }).superRefine((part, context) => {
    if (part.method === "cash" && !part.cashboxId) {
      context.addIssue({ code: "custom", message: "cashboxId is required for cash payments", path: ["cashboxId"] });
    }
    if (part.method === "deposit" && !part.depositId) {
      context.addIssue({ code: "custom", message: "depositId is required for deposit payments", path: ["depositId"] });
    }
    if (part.method !== "deposit" && part.depositId) {
      context.addIssue({ code: "custom", message: "depositId is only valid for deposit payments", path: ["depositId"] });
    }
    if (part.method !== "cash" && part.cashboxId) {
      context.addIssue({ code: "custom", message: "cashboxId is only valid for cash payments", path: ["cashboxId"] });
    }
  })).min(1),
  allocations: z.array(z.object({ chargeId: uuidSchema, amountMinor: moneyMinorSchema })).default([])
});

export const createRefundSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  parts: z.array(z.object({ paymentPartId: uuidSchema, amountMinor: moneyMinorSchema })).min(1),
  allocations: z.array(z.object({
    paymentAllocationId: uuidSchema.optional(),
    depositId: uuidSchema.optional(),
    amountMinor: moneyMinorSchema
  }).refine((value) => Boolean(value.paymentAllocationId) !== Boolean(value.depositId), {
    message: "Exactly one of paymentAllocationId or depositId is required"
  })).min(1)
});

export const createCashboxSchema = z.object({
  branchId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(160),
  currency: currencySchema.default("KZT")
});

export const openCashSessionSchema = z.object({
  openingAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)
});

export const closeCashSessionSchema = z.object({
  closingAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  note: optionalText(500)
});

export const createExpenseCategorySchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(160),
  currency: currencySchema.default("KZT")
});

export const createExpenseSchema = z.object({
  branchId: uuidSchema,
  categoryId: uuidSchema,
  cashboxId: uuidSchema,
  amountMinor: moneyMinorSchema,
  description: z.string().trim().min(1).max(500),
  occurredAt: dateTimeSchema.optional()
});

export type CreateChargeInput = z.infer<typeof createChargeSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
export type CreateCashboxInput = z.infer<typeof createCashboxSchema>;
export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const createBranchSchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(160),
  timezone: z.string().trim().min(1).max(64).default("Asia/Almaty")
});

export const updateOrganizationSchema = z.object({ name: z.string().trim().min(1).max(160) });
export const updateBranchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  timezone: z.string().trim().min(1).max(64).optional()
}).refine((value) => Object.keys(value).length > 0);

export const createServiceCategorySchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(160)
});

export const updateServiceCategorySchema = z.object({ name: z.string().trim().min(1).max(160) });
export const createDiagnosisCatalogSchema = z.object({
  organizationId: uuidSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(500)
});
export const updateDiagnosisCatalogSchema = z.object({ name: z.string().trim().min(1).max(500) });

export const renameResourceSchema = z.object({ name: z.string().trim().min(1).max(180) });
export const updateServiceCatalogSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  categoryId: uuidSchema.nullable().optional(),
  durationMinutes: z.number().int().min(5).max(720).optional()
}).refine((value) => Object.keys(value).length > 0);

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type CreateServiceCategoryInput = z.infer<typeof createServiceCategorySchema>;
export type CreateDiagnosisCatalogInput = z.infer<typeof createDiagnosisCatalogSchema>;
export type UpdateServiceCatalogInput = z.infer<typeof updateServiceCatalogSchema>;

// Phase 4 — CRM and Workflow
export const createCrmCatalogItemSchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(120)
});

export const createOpportunityStageSchema = z.object({
  organizationId: uuidSchema,
  key: z.string().trim().min(1).max(48).regex(/^[a-z0-9_]+$/),
  name: z.string().trim().min(1).max(120),
  position: z.number().int().nonnegative(),
  isTerminal: z.boolean().default(false),
  terminalKind: z.enum(["won", "lost"]).optional()
}).superRefine((value, context) => {
  if (value.isTerminal !== Boolean(value.terminalKind)) {
    context.addIssue({ code: "custom", message: "terminalKind is required only for terminal stages", path: ["terminalKind"] });
  }
});

export const createLeadSchema = z.object({
  organizationId: uuidSchema,
  branchId: uuidSchema.optional(),
  sourceId: uuidSchema.optional(),
  channelId: uuidSchema.optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: optionalText(80),
  phone: z.string().trim().min(5).max(32),
  email: z.email().optional(),
  interest: optionalText(500),
  notes: optionalText(4000)
});

export const updateLeadSchema = z.object({
  sourceId: uuidSchema.nullable().optional(),
  channelId: uuidSchema.nullable().optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().min(5).max(32).optional(),
  email: z.email().nullable().optional(),
  interest: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  status: z.enum(["new", "qualified"]).optional()
}).refine((value) => Object.keys(value).length > 0);

export const convertLeadSchema = z.object({
  patientId: uuidSchema.optional(),
  opportunityTitle: z.string().trim().min(1).max(180),
  expectedAmountMinor: z.number().int().nonnegative().optional(),
  currency: currencySchema.default("KZT")
});

export const loseLeadSchema = z.object({ reason: z.string().trim().min(3).max(1000) });

export const createOpportunitySchema = z.object({
  organizationId: uuidSchema,
  branchId: uuidSchema.optional(),
  patientId: uuidSchema,
  leadId: uuidSchema.optional(),
  treatmentPlanId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  title: z.string().trim().min(1).max(180),
  expectedAmountMinor: z.number().int().nonnegative().optional(),
  currency: currencySchema.default("KZT")
});

export const transitionOpportunitySchema = z.object({
  stageId: uuidSchema,
  reason: z.string().trim().min(3).max(1000).optional()
});

export const linkOpportunityPlanSchema = z.object({ treatmentPlanId: uuidSchema });

export const createCrmActivitySchema = z.object({
  organizationId: uuidSchema,
  branchId: uuidSchema.optional(),
  leadId: uuidSchema.optional(),
  opportunityId: uuidSchema.optional(),
  patientId: uuidSchema.optional(),
  activityType: z.enum(["note", "call", "message", "email", "meeting"]),
  direction: z.enum(["inbound", "outbound"]).optional(),
  subject: optionalText(180),
  body: z.string().trim().min(1).max(10_000)
}).refine((value) => Boolean(value.leadId || value.opportunityId || value.patientId), {
  message: "At least one CRM subject is required"
});

export const createTaskSchema = z.object({
  organizationId: uuidSchema,
  branchId: uuidSchema.optional(),
  assignedEmployeeId: uuidSchema.optional(),
  entityType: z.string().trim().min(1).max(48).optional(),
  entityId: uuidSchema.optional(),
  title: z.string().trim().min(1).max(180),
  description: optionalText(10_000),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  dueAt: dateTimeSchema.optional()
}).refine((value) => Boolean(value.entityType) === Boolean(value.entityId), {
  message: "entityType and entityId must be supplied together"
});

export const transitionTaskSchema = z.object({
  status: z.enum(["open", "in_progress", "completed", "cancelled"]),
  reason: optionalText(1000)
});
export const createTaskCommentSchema = z.object({ body: z.string().trim().min(1).max(10_000) });

const workflowConditionSchema = z.object({
  fieldPath: z.string().trim().min(1).max(255).regex(/^[a-zA-Z0-9_.]+$/),
  operator: z.enum(["equals", "not_equals", "exists", "in"]),
  expectedValue: z.unknown().optional()
});
const createTaskActionSchema = z.object({
  actionType: z.literal("CREATE_TASK"),
  configuration: z.object({
    title: z.string().trim().min(1).max(180),
    description: optionalText(10_000),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    dueInMinutes: z.number().int().min(0).max(525_600).optional(),
    branchId: uuidSchema.optional(),
    assignedEmployeeId: uuidSchema.optional(),
    entityType: z.string().trim().min(1).max(48).optional(),
    entityIdPath: z.string().trim().min(1).max(255).regex(/^[a-zA-Z0-9_.]+$/).optional()
  }).refine((value) => Boolean(value.entityType) === Boolean(value.entityIdPath), {
    message: "entityType and entityIdPath must be supplied together"
  })
});

export const createWorkflowRuleSchema = z.object({
  organizationId: uuidSchema,
  name: z.string().trim().min(1).max(160),
  eventType: z.string().trim().min(1).max(128).regex(/^[A-Za-z][A-Za-z0-9]+$/),
  delaySeconds: z.number().int().min(0).max(31_536_000).default(0),
  conditions: z.array(workflowConditionSchema).max(20).default([]),
  actions: z.array(createTaskActionSchema).min(1).max(20)
});

export const setWorkflowRuleActiveSchema = z.object({ active: z.boolean() });

export type CreateCrmCatalogItemInput = z.infer<typeof createCrmCatalogItemSchema>;
export type CreateOpportunityStageInput = z.infer<typeof createOpportunityStageSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type TransitionOpportunityInput = z.infer<typeof transitionOpportunitySchema>;
export type CreateCrmActivityInput = z.infer<typeof createCrmActivitySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type TransitionTaskInput = z.infer<typeof transitionTaskSchema>;
export type CreateWorkflowRuleInput = z.infer<typeof createWorkflowRuleSchema>;

// Phase 5 — Recall and Waitlist
export const createRecallTypeSchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(160),
  serviceId: uuidSchema.optional(),
  intervalDays: z.number().int().min(1).max(3650),
  active: z.boolean().default(true)
});

export const recallAttemptSchema = z.object({
  channel: z.enum(["phone", "sms", "email", "messenger", "other"]),
  outcome: z.enum(["no_answer", "contacted", "declined", "booked"]),
  notes: optionalText(4000),
  appointmentId: uuidSchema.optional()
}).superRefine((value, context) => {
  if (value.outcome === "booked" && !value.appointmentId) {
    context.addIssue({ code: "custom", message: "appointmentId is required for a booked recall", path: ["appointmentId"] });
  }
});

const waitlistTimeRangeSchema = z.object({
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
}).refine((value) => value.endsAt > value.startsAt, { message: "endsAt must be later than startsAt", path: ["endsAt"] });

export const createWaitlistEntrySchema = z.object({
  organizationId: uuidSchema,
  patientId: uuidSchema,
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
  desiredDurationMinutes: z.number().int().min(5).max(720),
  minimumNoticeMinutes: z.number().int().min(0).max(525_600).default(0),
  priority: z.number().int().min(0).max(100).default(0),
  doctorIds: z.array(uuidSchema).max(50).default([]),
  specialties: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  branchIds: z.array(uuidSchema).max(50).default([]),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  timeRanges: z.array(waitlistTimeRangeSchema).max(14).default([]),
  notes: optionalText(4000)
}).refine((value) => value.dateTo >= value.dateFrom, {
  message: "dateTo must be on or after dateFrom", path: ["dateTo"]
});

export const cancelWaitlistEntrySchema = z.object({ reason: z.string().trim().min(1).max(1000) });

export const publicWaitlistOfferSchema = z.object({
  token: z.string().trim().min(1).max(200)
});

export type CreateRecallTypeInput = z.infer<typeof createRecallTypeSchema>;
export type RecallAttemptInput = z.infer<typeof recallAttemptSchema>;
export type CreateWaitlistEntryInput = z.infer<typeof createWaitlistEntrySchema>;
