export enum DomainEventType {
  // Platform & Org
  TENANT_CREATED = 'TenantCreated',
  ORGANIZATION_CREATED = 'OrganizationCreated',
  BRANCH_CREATED = 'BranchCreated',
  CHAIR_CREATED = 'ChairCreated',

  // Identity
  USER_CREATED = 'UserCreated',
  USER_LOGGED_IN = 'UserLoggedIn',
  USER_ROLE_ASSIGNED = 'UserRoleAssigned',

  // Audit
  AUDIT_EVENT_RECORDED = 'AuditEventRecorded',
  SECURITY_EVENT_RECORDED = 'SecurityEventRecorded',

  // Scheduling (Phase 1 preview)
  APPOINTMENT_CREATED = 'AppointmentCreated',
  APPOINTMENT_CONFIRMED = 'AppointmentConfirmed',
  APPOINTMENT_CHECKED_IN = 'AppointmentCheckedIn',
  APPOINTMENT_COMPLETED = 'AppointmentCompleted',
  APPOINTMENT_CANCELLED = 'AppointmentCancelled',

  // Clinical (Phase 2 preview)
  ENCOUNTER_STARTED = 'EncounterStarted',
  CLINICAL_NOTE_SIGNED = 'ClinicalNoteSigned',

  // Finance (Phase 3 preview)
  PAYMENT_POSTED = 'PaymentPosted',
  PAYMENT_REFUNDED = 'PaymentRefunded'
}

export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  tenantId: string;
  eventName: DomainEventType | string;
  payload: T;
  occurredAt: string;
  actorUserId?: string;
  actorEmployeeId?: string;
}

export interface TenantCreatedPayload {
  tenantId: string;
  name: string;
  subdomain: string;
  ownerEmail: string;
}

export interface OrganizationCreatedPayload {
  organizationId: string;
  name: string;
  tenantId: string;
}

export interface BranchCreatedPayload {
  branchId: string;
  organizationId: string;
  name: string;
  city: string;
  tenantId: string;
}
