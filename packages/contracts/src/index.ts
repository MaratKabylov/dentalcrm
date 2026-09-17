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

// Phase 6 — Inventory
const inventoryQuantitySchema = z.number().positive().max(1_000_000_000);
const inventoryItemSchema = z.object({
  productId: uuidSchema,
  quantity: inventoryQuantitySchema
});

export const createUnitOfMeasureSchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(120),
  symbol: z.string().trim().min(1).max(16),
  decimalPlaces: z.number().int().min(0).max(6).default(3)
});

export const createProductCategorySchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(160)
});

export const createProductSchema = z.object({
  organizationId: uuidSchema,
  categoryId: uuidSchema.optional(),
  unitId: uuidSchema,
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(180),
  barcode: z.string().trim().min(1).max(64).optional(),
  trackBatches: z.boolean().default(true),
  minimumStock: z.number().nonnegative().max(1_000_000_000).default(0)
});

export const createSupplierSchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(180),
  phone: optionalText(32),
  email: z.email().optional()
});

export const createWarehouseSchema = z.object({
  organizationId: uuidSchema,
  branchId: uuidSchema.optional(),
  code: codeSchema,
  name: z.string().trim().min(1).max(160)
});

export const receiveStockSchema = z.object({
  warehouseId: uuidSchema,
  supplierId: uuidSchema.optional(),
  reference: optionalText(120),
  receivedAt: dateTimeSchema.optional(),
  items: z.array(inventoryItemSchema.extend({
    lotNumber: z.string().trim().min(1).max(120).optional(),
    manufacturedAt: z.string().date().optional(),
    expiresAt: z.string().date().optional(),
    purchasePriceMinor: z.number().int().nonnegative().optional(),
    currency: z.string().trim().length(3).default("KZT")
  }).refine((item) => !item.manufacturedAt || !item.expiresAt || item.expiresAt >= item.manufacturedAt, {
    message: "expiresAt must be on or after manufacturedAt", path: ["expiresAt"]
  })).min(1).max(500)
});

export const transferStockSchema = z.object({
  sourceWarehouseId: uuidSchema,
  destinationWarehouseId: uuidSchema,
  notes: optionalText(1000),
  items: z.array(inventoryItemSchema).min(1).max(500)
}).refine((value) => value.sourceWarehouseId !== value.destinationWarehouseId, {
  message: "Warehouses must differ", path: ["destinationWarehouseId"]
});

export const writeoffStockSchema = z.object({
  warehouseId: uuidSchema,
  reason: z.string().trim().min(1).max(1000),
  items: z.array(inventoryItemSchema).min(1).max(500)
});

export const createStocktakeSchema = z.object({
  warehouseId: uuidSchema,
  notes: optionalText(1000),
  items: z.array(z.object({
    productId: uuidSchema,
    batchId: uuidSchema.optional(),
    countedQuantity: z.number().nonnegative().max(1_000_000_000)
  })).min(1).max(2000)
});

export const upsertServiceRecipeSchema = z.object({
  organizationId: uuidSchema,
  serviceId: uuidSchema,
  items: z.array(inventoryItemSchema).min(1).max(100)
});

export const confirmMaterialConsumptionSchema = z.object({
  warehouseId: uuidSchema,
  items: z.array(inventoryItemSchema).min(1).max(100).optional()
});

export type CreateUnitOfMeasureInput = z.infer<typeof createUnitOfMeasureSchema>;
export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
export type WriteoffStockInput = z.infer<typeof writeoffStockSchema>;
export type CreateStocktakeInput = z.infer<typeof createStocktakeSchema>;
export type UpsertServiceRecipeInput = z.infer<typeof upsertServiceRecipeSchema>;
export type ConfirmMaterialConsumptionInput = z.infer<typeof confirmMaterialConsumptionSchema>;

// Phase 7 — Compensation
const compensationConditionSchema = z.object({
  employeeId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  serviceId: uuidSchema.optional(),
  serviceCategoryId: uuidSchema.optional(),
  paymentMethod: z.enum(["cash", "card", "bank_transfer", "deposit", "insurance", "other"]).optional()
});

export const compensationRuleVersionSchema = z.object({
  calculationType: z.enum(["percentage", "fixed", "hourly", "salary", "formula"]),
  calculationBasis: z.enum([
    "gross_service_amount", "net_after_discount", "net_after_acquiring", "net_after_materials",
    "net_after_laboratory", "custom"
  ]).default("gross_service_amount"),
  rate: z.number().positive().max(100).optional(),
  amountMinor: z.number().int().nonnegative().optional(),
  formula: z.record(z.string(), z.unknown()).optional(),
  currency: z.string().trim().length(3).default("KZT"),
  validFrom: z.string().date(),
  validTo: z.string().date().optional(),
  condition: compensationConditionSchema.default({})
}).superRefine((value, context) => {
  if (value.validTo && value.validTo < value.validFrom) {
    context.addIssue({ code: "custom", message: "validTo must be on or after validFrom", path: ["validTo"] });
  }
  if (value.calculationType === "percentage" && value.rate === undefined) {
    context.addIssue({ code: "custom", message: "rate is required for percentage rules", path: ["rate"] });
  }
  if (["fixed", "hourly", "salary"].includes(value.calculationType) && value.amountMinor === undefined) {
    context.addIssue({ code: "custom", message: "amountMinor is required for fixed, hourly, and salary rules", path: ["amountMinor"] });
  }
  if (value.calculationType === "formula" && value.formula === undefined) {
    context.addIssue({ code: "custom", message: "formula is required for formula rules", path: ["formula"] });
  }
});

export const createCompensationRuleSchema = z.object({
  organizationId: uuidSchema,
  name: z.string().trim().min(1).max(160),
  version: compensationRuleVersionSchema
});

export const createTimesheetSchema = z.object({
  organizationId: uuidSchema,
  employeeId: uuidSchema,
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  entries: z.array(z.object({
    branchId: uuidSchema,
    workedOn: z.string().date(),
    minutes: z.number().int().min(1).max(1440),
    notes: optionalText(1000)
  })).min(1).max(366)
}).superRefine((value, context) => {
  if (value.endsOn < value.startsOn) context.addIssue({ code: "custom", message: "endsOn must be on or after startsOn", path: ["endsOn"] });
  value.entries.forEach((entry, index) => {
    if (entry.workedOn < value.startsOn || entry.workedOn > value.endsOn) {
      context.addIssue({ code: "custom", message: "workedOn must be inside the timesheet period", path: ["entries", index, "workedOn"] });
    }
  });
});

export const rejectTimesheetSchema = z.object({ reason: z.string().trim().min(1).max(1000) });

export const createPayrollPeriodSchema = z.object({
  organizationId: uuidSchema,
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  currency: z.string().trim().length(3).default("KZT")
}).refine((value) => value.endsOn >= value.startsOn, { message: "endsOn must be on or after startsOn", path: ["endsOn"] });

export const createPayrollAdjustmentSchema = z.object({
  employeeId: uuidSchema,
  amountMinor: z.number().int().refine((value) => value !== 0, "amountMinor must not be zero"),
  reason: z.string().trim().min(1).max(1000)
});

export const approvePayrollSchema = z.object({ note: optionalText(1000) });

export type CompensationRuleVersionInput = z.infer<typeof compensationRuleVersionSchema>;
export type CreateCompensationRuleInput = z.infer<typeof createCompensationRuleSchema>;
export type CreateTimesheetInput = z.infer<typeof createTimesheetSchema>;
export type CreatePayrollPeriodInput = z.infer<typeof createPayrollPeriodSchema>;
export type CreatePayrollAdjustmentInput = z.infer<typeof createPayrollAdjustmentSchema>;

// Phase 8 — Patient Experience
export const messagingChannels = ["whatsapp", "sms", "email", "push", "in_app"] as const;

export const createMessageTemplateSchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(160),
  channel: z.enum(messagingChannels),
  locale: z.string().trim().min(2).max(16).default("ru"),
  subject: optionalText(255),
  body: z.string().trim().min(1).max(20_000)
});
export const messageTemplateVersionSchema = createMessageTemplateSchema.pick({ locale: true, subject: true, body: true });

export const queueNotificationSchema = z.object({
  organizationId: uuidSchema,
  patientId: uuidSchema.optional(),
  templateId: uuidSchema,
  channel: z.enum(messagingChannels),
  recipient: z.string().trim().min(3).max(320),
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  scheduledAt: dateTimeSchema.optional(),
  correlationId: z.string().trim().min(1).max(128),
  idempotencyKey: idempotencyKeySchema
});

export const createPortalInvitationSchema = z.object({
  organizationId: uuidSchema,
  patientId: uuidSchema,
  contactType: z.enum(["email", "phone"]),
  contact: z.string().trim().min(3).max(320),
  relationship: z.enum(["self", "parent", "guardian", "representative"]),
  evidenceReference: z.string().trim().min(3).max(1000),
  accessLevel: z.enum(["read_only", "full"]).default("full"),
  expiresInHours: z.number().int().min(1).max(168).default(24)
});

export const exchangePortalInvitationSchema = z.object({ invitationToken: z.string().trim().min(20).max(256) });
export const portalSessionTokenSchema = z.string().trim().min(20).max(256);
export const portalCancelAppointmentSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export const portalRescheduleAppointmentSchema = z.object({
  slotId: uuidSchema,
  reason: z.string().trim().min(1).max(500)
});

export const createBookingRuleSchema = z.object({
  organizationId: uuidSchema,
  branchId: uuidSchema,
  doctorId: uuidSchema,
  serviceId: uuidSchema,
  chairId: uuidSchema.optional(),
  slotIntervalMinutes: z.number().int().min(5).max(240).default(15),
  minimumNoticeMinutes: z.number().int().min(0).max(525_600).default(120),
  bookingHorizonDays: z.number().int().min(1).max(365).default(90),
  active: z.boolean().default(true)
});

export const publishBookingSlotsSchema = z.object({
  startsAt: z.array(dateTimeSchema).min(1).max(1000)
});

export const publicBookingRangeSchema = z.object({
  from: dateTimeSchema,
  to: dateTimeSchema,
  serviceId: uuidSchema.optional(),
  doctorId: uuidSchema.optional(),
  branchId: uuidSchema.optional()
}).refine((value) => Date.parse(value.to) > Date.parse(value.from), { message: "to must be later than from" });

export const confirmPublicBookingSchema = z.object({
  slotId: uuidSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(5).max(32),
  email: z.email().optional(),
  notes: optionalText(1000)
});

export const intakeFieldSchema = z.object({
  key: z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(255),
  type: z.enum(["text", "date", "boolean", "choice", "file"]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(255)).max(100).optional()
});

export const createIntakeFormSchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(160),
  fields: z.array(intakeFieldSchema).min(1).max(200)
});
export const intakeFormVersionSchema = createIntakeFormSchema.pick({ fields: true });

export const issueIntakeSchema = z.object({
  patientId: uuidSchema,
  expiresInHours: z.number().int().min(1).max(720).default(72)
});

export const submitIntakeSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  uploads: z.array(z.object({
    fieldKey: z.string().trim().min(1).max(64),
    storageKey: z.string().trim().min(1).max(1024),
    mimeType: z.string().trim().min(1).max(127)
  })).max(20).default([])
});

export const recordOcrResultSchema = z.object({
  provider: z.string().trim().min(1).max(64),
  extractedData: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1).optional(),
  rawReference: optionalText(1024)
});

export const confirmOcrResultSchema = z.object({
  acceptedData: z.record(z.string(), z.unknown())
});

export const reviewIntakeSchema = z.object({
  applyToPatient: z.boolean().default(false),
  note: optionalText(1000)
});

export const createReviewDestinationSchema = z.object({
  organizationId: uuidSchema,
  name: z.string().trim().min(1).max(120),
  url: z.url(),
  active: z.boolean().default(true)
});

export const createReviewRequestSchema = z.object({
  organizationId: uuidSchema,
  appointmentId: uuidSchema,
  destinationId: uuidSchema.optional(),
  expiresInDays: z.number().int().min(1).max(90).default(14)
});

export const submitReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: optionalText(4000)
});

export type CreateMessageTemplateInput = z.infer<typeof createMessageTemplateSchema>;
export type MessageTemplateVersionInput = z.infer<typeof messageTemplateVersionSchema>;
export type QueueNotificationInput = z.infer<typeof queueNotificationSchema>;
export type CreatePortalInvitationInput = z.infer<typeof createPortalInvitationSchema>;
export type PortalRescheduleAppointmentInput = z.infer<typeof portalRescheduleAppointmentSchema>;
export type CreateBookingRuleInput = z.infer<typeof createBookingRuleSchema>;
export type PublishBookingSlotsInput = z.infer<typeof publishBookingSlotsSchema>;
export type PublicBookingRangeInput = z.infer<typeof publicBookingRangeSchema>;
export type ConfirmPublicBookingInput = z.infer<typeof confirmPublicBookingSchema>;
export type CreateIntakeFormInput = z.infer<typeof createIntakeFormSchema>;
export type IntakeFormVersionInput = z.infer<typeof intakeFormVersionSchema>;
export type IssueIntakeInput = z.infer<typeof issueIntakeSchema>;
export type SubmitIntakeInput = z.infer<typeof submitIntakeSchema>;
export type RecordOcrResultInput = z.infer<typeof recordOcrResultSchema>;
export type ConfirmOcrResultInput = z.infer<typeof confirmOcrResultSchema>;
export type ReviewIntakeInput = z.infer<typeof reviewIntakeSchema>;
export type CreateReviewDestinationInput = z.infer<typeof createReviewDestinationSchema>;
export type CreateReviewRequestInput = z.infer<typeof createReviewRequestSchema>;
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

// Phase 9 — Laboratory, Insurance, and Loyalty
export const labCaseStatuses = ["ordered", "impression_taken", "sent", "in_production", "received", "fitted", "completed", "rework", "cancelled"] as const;

export const createLaboratorySchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(180),
  phone: optionalText(32),
  email: z.email().optional(),
  address: optionalText(500)
});

export const createLabCaseSchema = z.object({
  organizationId: uuidSchema,
  laboratoryId: uuidSchema,
  patientId: uuidSchema,
  encounterId: uuidSchema.optional(),
  responsibleDoctorId: uuidSchema,
  expectedAt: dateTimeSchema.optional(),
  notes: optionalText(4000),
  items: z.array(z.object({
    procedureId: uuidSchema.optional(),
    treatmentPlanItemId: uuidSchema.optional(),
    description: z.string().trim().min(1).max(500),
    toothNumber: z.number().int().min(11).max(85).optional(),
    shade: optionalText(64),
    costMinor: z.number().int().nonnegative(),
    currency: currencySchema.default("KZT")
  }).refine((item) => item.procedureId !== undefined || item.treatmentPlanItemId !== undefined, {
    message: "procedureId or treatmentPlanItemId is required"
  })).min(1).max(100)
});

export const transitionLabCaseSchema = z.object({
  status: z.enum(labCaseStatuses),
  occurredAt: dateTimeSchema.optional(),
  reason: optionalText(1000)
});

export const addLabCaseFileSchema = z.object({
  kind: z.string().trim().min(1).max(64),
  storageKey: z.string().trim().min(1).max(1024),
  mimeType: z.string().trim().min(1).max(127),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i)
});

export const recordLabInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(120),
  totalCostMinor: z.number().int().nonnegative(),
  currency: currencySchema.default("KZT"),
  issuedOn: z.string().date(),
  dueOn: z.string().date().optional()
}).refine((value) => !value.dueOn || value.dueOn >= value.issuedOn, { message: "dueOn must be on or after issuedOn", path: ["dueOn"] });

export const createInsuranceCompanySchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(180),
  contact: optionalText(500)
});

export const createInsurancePlanSchema = z.object({
  companyId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(180),
  currency: currencySchema.default("KZT")
});

export const createInsurancePriceListSchema = z.object({
  planId: uuidSchema,
  name: z.string().trim().min(1).max(180),
  validFrom: z.string().date(),
  validTo: z.string().date().optional(),
  items: z.array(z.object({ serviceId: uuidSchema, priceMinor: z.number().int().nonnegative() })).min(1).max(1000)
}).refine((value) => !value.validTo || value.validTo >= value.validFrom, { message: "validTo must be on or after validFrom", path: ["validTo"] });

export const createPatientPolicySchema = z.object({
  planId: uuidSchema,
  patientId: uuidSchema,
  policyNumber: z.string().trim().min(1).max(120),
  validFrom: z.string().date(),
  validTo: z.string().date().optional(),
  coveragePercent: z.number().min(0).max(100).default(100)
}).refine((value) => !value.validTo || value.validTo >= value.validFrom, { message: "validTo must be on or after validFrom", path: ["validTo"] });

export const createInsuranceClaimSchema = z.object({
  policyId: uuidSchema,
  branchId: uuidSchema,
  serviceDate: z.string().date(),
  items: z.array(z.object({
    procedureId: uuidSchema,
    billedAmountMinor: z.number().int().positive()
  })).min(1).max(200)
});

export const adjudicateInsuranceClaimSchema = z.object({
  items: z.array(z.object({
    claimItemId: uuidSchema,
    approvedAmountMinor: z.number().int().nonnegative(),
    reason: optionalText(1000)
  })).min(1)
});

export const recordInsurancePaymentSchema = z.object({
  amountMinor: z.number().int().positive(),
  reference: z.string().trim().min(1).max(255),
  paidAt: dateTimeSchema.optional(),
  idempotencyKey: idempotencyKeySchema
});

export const createLoyaltyProgramSchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(180),
  currency: currencySchema.default("KZT"),
  earningRateBps: z.number().int().min(0).max(10_000),
  maxRedemptionBps: z.number().int().min(0).max(10_000),
  validFrom: z.string().date(),
  validTo: z.string().date().optional()
}).refine((value) => !value.validTo || value.validTo >= value.validFrom, { message: "validTo must be on or after validFrom", path: ["validTo"] });

export const awardLoyaltySchema = z.object({ paymentId: uuidSchema, idempotencyKey: idempotencyKeySchema });
export const adjustLoyaltySchema = z.object({
  patientId: uuidSchema,
  points: z.number().int().refine((value) => value !== 0, "points must not be zero"),
  reason: z.string().trim().min(3).max(1000),
  idempotencyKey: idempotencyKeySchema
});
export const redeemLoyaltySchema = z.object({
  chargeId: uuidSchema,
  points: z.number().int().positive(),
  idempotencyKey: idempotencyKeySchema
});

export const createPromotionSchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().trim().min(1).max(180),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number().int().positive(),
  validFrom: dateTimeSchema,
  validTo: dateTimeSchema,
  serviceIds: z.array(uuidSchema).max(500).default([]),
  usageLimit: z.number().int().positive().optional()
}).superRefine((value, context) => {
  if (Date.parse(value.validTo) <= Date.parse(value.validFrom)) context.addIssue({ code: "custom", message: "validTo must be later than validFrom", path: ["validTo"] });
  if (value.discountType === "percentage" && value.discountValue > 10_000) context.addIssue({ code: "custom", message: "percentage discount uses basis points and cannot exceed 10000", path: ["discountValue"] });
});

export const createCouponSchema = z.object({
  promotionId: uuidSchema,
  code: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/),
  patientId: uuidSchema.optional(),
  expiresAt: dateTimeSchema.optional(),
  maxUses: z.number().int().positive().default(1)
});

export const quotePromotionSchema = z.object({
  organizationId: uuidSchema,
  patientId: uuidSchema.optional(),
  serviceId: uuidSchema.optional(),
  couponCode: z.string().trim().min(3).max(64).optional(),
  grossAmountMinor: z.number().int().positive(),
  at: dateTimeSchema.optional()
});

export const redeemPromotionSchema = quotePromotionSchema.extend({
  referenceType: z.string().trim().min(1).max(48),
  referenceId: uuidSchema,
  idempotencyKey: idempotencyKeySchema
});

export type CreateLaboratoryInput = z.infer<typeof createLaboratorySchema>;
export type CreateLabCaseInput = z.infer<typeof createLabCaseSchema>;
export type TransitionLabCaseInput = z.infer<typeof transitionLabCaseSchema>;
export type AddLabCaseFileInput = z.infer<typeof addLabCaseFileSchema>;
export type RecordLabInvoiceInput = z.infer<typeof recordLabInvoiceSchema>;
export type CreateInsuranceCompanyInput = z.infer<typeof createInsuranceCompanySchema>;
export type CreateInsurancePlanInput = z.infer<typeof createInsurancePlanSchema>;
export type CreateInsurancePriceListInput = z.infer<typeof createInsurancePriceListSchema>;
export type CreatePatientPolicyInput = z.infer<typeof createPatientPolicySchema>;
export type CreateInsuranceClaimInput = z.infer<typeof createInsuranceClaimSchema>;
export type AdjudicateInsuranceClaimInput = z.infer<typeof adjudicateInsuranceClaimSchema>;
export type RecordInsurancePaymentInput = z.infer<typeof recordInsurancePaymentSchema>;
export type CreateLoyaltyProgramInput = z.infer<typeof createLoyaltyProgramSchema>;
export type AwardLoyaltyInput = z.infer<typeof awardLoyaltySchema>;
export type AdjustLoyaltyInput = z.infer<typeof adjustLoyaltySchema>;
export type RedeemLoyaltyInput = z.infer<typeof redeemLoyaltySchema>;
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type QuotePromotionInput = z.infer<typeof quotePromotionSchema>;
export type RedeemPromotionInput = z.infer<typeof redeemPromotionSchema>;
