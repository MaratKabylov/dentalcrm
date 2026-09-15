import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
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
