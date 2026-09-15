import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1)
};

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("active"),
  ...timestamps
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalSubject: varchar("external_subject", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 320 }),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  ...timestamps
});

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    ...timestamps,
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id)
  },
  (table) => [
    unique("organizations_tenant_code_unique").on(table.tenantId, table.code),
    index("organizations_tenant_idx").on(table.tenantId)
  ]
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Almaty"),
    ...timestamps,
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id)
  },
  (table) => [unique("branches_tenant_code_unique").on(table.tenantId, table.code)]
);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: varchar("action", { length: 96 }).notNull(),
  entityType: varchar("entity_type", { length: 96 }).notNull(),
  entityId: uuid("entity_id"),
  beforeSnapshot: jsonb("before_snapshot"),
  afterSnapshot: jsonb("after_snapshot"),
  reason: text("reason"),
  requestId: varchar("request_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  hash: varchar("hash", { length: 64 }).notNull()
});

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  aggregateType: varchar("aggregate_type", { length: 96 }).notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  eventType: varchar("event_type", { length: 128 }).notNull(),
  payload: jsonb("payload").notNull(),
  requestId: varchar("request_id", { length: 128 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error")
});

export const outboxDeliveries = pgTable(
  "outbox_deliveries",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    eventId: uuid("event_id").notNull().references(() => outboxEvents.id),
    handler: varchar("handler", { length: 128 }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.eventId, table.handler] })]
);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  key: varchar("key", { length: 64 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  ...timestamps
});

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id), code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(), ...timestamps, archivedAt: timestamp("archived_at", { withTimezone: true })
}, (table) => [unique("rooms_tenant_branch_code_unique").on(table.tenantId, table.branchId, table.code)]);

export const chairs = pgTable("chairs", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id), roomId: uuid("room_id").references(() => rooms.id),
  code: varchar("code", { length: 32 }).notNull(), name: varchar("name", { length: 120 }).notNull(),
  ...timestamps, archivedAt: timestamp("archived_at", { withTimezone: true })
}, (table) => [unique("chairs_tenant_branch_code_unique").on(table.tenantId, table.branchId, table.code)]);

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").references(() => users.id), firstName: varchar("first_name", { length: 80 }).notNull(),
  lastName: varchar("last_name", { length: 80 }).notNull(), middleName: varchar("middle_name", { length: 80 }),
  phone: varchar("phone", { length: 32 }), email: varchar("email", { length: 320 }),
  status: varchar("status", { length: 24 }).notNull().default("active"), ...timestamps
});

export const employeeBranches = pgTable("employee_branches", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id), employeeId: uuid("employee_id").notNull().references(() => employees.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.tenantId, table.employeeId, table.branchId] })]);

export const doctors = pgTable("doctors", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  employeeId: uuid("employee_id").notNull().references(() => employees.id), specialty: varchar("specialty", { length: 120 }),
  calendarColor: varchar("calendar_color", { length: 7 }).notNull().default("#0d766f"), ...timestamps
}, (table) => [unique("doctors_tenant_employee_unique").on(table.tenantId, table.employeeId)]);

export const serviceCategories = pgTable("service_categories", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  code: varchar("code", { length: 32 }).notNull(), name: varchar("name", { length: 160 }).notNull(),
  ...timestamps, archivedAt: timestamp("archived_at", { withTimezone: true })
}, (table) => [unique("service_categories_tenant_code_unique").on(table.tenantId, table.code)]);

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  categoryId: uuid("category_id").references(() => serviceCategories.id), code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(), durationMinutes: integer("duration_minutes").notNull(),
  active: boolean("active").notNull().default(true), ...timestamps
}, (table) => [unique("services_tenant_code_unique").on(table.tenantId, table.code)]);

export const priceLists = pgTable("price_lists", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  branchId: uuid("branch_id").references(() => branches.id), name: varchar("name", { length: 160 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KZT"), validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"), active: boolean("active").notNull().default(true), ...timestamps
});

export const priceListItems = pgTable("price_list_items", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  priceListId: uuid("price_list_id").notNull().references(() => priceLists.id), serviceId: uuid("service_id").notNull().references(() => services.id),
  priceMinor: bigint("price_minor", { mode: "number" }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [unique("price_list_items_tenant_list_service_unique").on(table.tenantId, table.priceListId, table.serviceId)]);

export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  firstName: varchar("first_name", { length: 80 }).notNull(), lastName: varchar("last_name", { length: 80 }).notNull(),
  middleName: varchar("middle_name", { length: 80 }), birthDate: date("birth_date"), sex: varchar("sex", { length: 16 }).notNull().default("unknown"),
  phone: varchar("phone", { length: 32 }).notNull(), phoneNormalized: varchar("phone_normalized", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }), notes: text("notes"), ...timestamps, archivedAt: timestamp("archived_at", { withTimezone: true })
}, (table) => [index("patients_tenant_name_idx").on(table.tenantId, table.lastName, table.firstName)]);

export const scheduleShifts = pgTable("schedule_shifts", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id), doctorId: uuid("doctor_id").notNull().references(() => doctors.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const scheduleTemplates = pgTable("schedule_templates", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id), doctorId: uuid("doctor_id").notNull().references(() => doctors.id),
  name: varchar("name", { length: 120 }).notNull(), weekday: smallint("weekday").notNull(), startsAt: time("starts_at").notNull(),
  endsAt: time("ends_at").notNull(), validFrom: date("valid_from").notNull(), validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  patientId: uuid("patient_id").notNull().references(() => patients.id), doctorId: uuid("doctor_id").notNull().references(() => doctors.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id), roomId: uuid("room_id").references(() => rooms.id),
  chairId: uuid("chair_id").references(() => chairs.id), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(), status: varchar("status", { length: 32 }).notNull().default("created"),
  source: varchar("source", { length: 24 }).notNull().default("internal"), reason: varchar("reason", { length: 500 }), notes: text("notes"),
  ...timestamps
}, (table) => [index("appointments_calendar_idx").on(table.tenantId, table.branchId, table.startsAt, table.endsAt)]);

export const appointmentServices = pgTable("appointment_services", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id), appointmentId: uuid("appointment_id").notNull().references(() => appointments.id),
  serviceId: uuid("service_id").notNull().references(() => services.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.tenantId, table.appointmentId, table.serviceId] })]);

export const appointmentStatusEvents = pgTable("appointment_status_events", {
  id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  appointmentId: uuid("appointment_id").notNull().references(() => appointments.id), fromStatus: varchar("from_status", { length: 32 }),
  toStatus: varchar("to_status", { length: 32 }).notNull(), reason: varchar("reason", { length: 500 }),
  actorUserId: uuid("actor_user_id").references(() => users.id), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
});
