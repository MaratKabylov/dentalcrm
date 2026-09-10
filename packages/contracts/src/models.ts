import { PermissionKey, StandardRole } from './permissions';

export interface AuthContext {
  userId: string;
  tenantId: string;
  branchId?: string;
  roles: (StandardRole | string)[];
  permissions: (PermissionKey | string)[];
  email: string;
  sessionId?: string;
}

export interface TenantDto {
  id: string;
  name: string;
  subdomain: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  settings?: TenantSettingsDto;
}

export interface TenantSettingsDto {
  timezone: string; // Default: 'Asia/Almaty' (UTC+5)
  currency: string; // Default: 'KZT'
  locale: string;   // 'kk' | 'ru'
  dateFormat: string;
}

export interface OrganizationDto {
  id: string;
  tenantId: string;
  name: string;
  bin?: string; // Business Identification Number (Kazakhstan БИН)
  legalAddress?: string;
  status: 'ACTIVE' | 'INACTIVE';
  branches?: BranchDto[];
}

export interface BranchDto {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  code?: string;
  city: string;
  address: string;
  phone?: string;
  status: 'ACTIVE' | 'INACTIVE';
  rooms?: RoomDto[];
}

export interface RoomDto {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  number?: string;
  floor?: string;
  chairs?: ChairDto[];
}

export interface ChairDto {
  id: string;
  tenantId: string;
  branchId: string;
  roomId: string;
  name: string;
  code?: string;
  status: 'OPERATIONAL' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  isAvailableForBooking: boolean;
}

export interface UserDto {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  iin?: string; // Kazakhstan Individual Identification Number (ИИН)
  isActive: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface AuditEventDto {
  id: string;
  tenantId: string;
  actorUserId?: string;
  actorEmployeeId?: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  reason?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  createdAt: string;
  hash: string;
}

export interface OutboxEventDto {
  id: string;
  tenantId: string;
  eventName: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  retryCount: number;
  scheduledAt: string;
  publishedAt?: string;
  lastError?: string;
}
