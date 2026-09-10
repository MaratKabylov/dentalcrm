export enum PermissionKey {
  // Platform & Organization
  PLATFORM_ADMIN = 'platform.admin',
  ORGANIZATION_MANAGE = 'organization.manage',
  BRANCH_MANAGE = 'branch.manage',
  CHAIR_MANAGE = 'chair.manage',

  // Identity & Staff
  USERS_READ = 'users.read',
  USERS_MANAGE = 'users.manage',
  ROLES_MANAGE = 'roles.manage',
  EMPLOYEES_READ = 'employees.read',
  EMPLOYEES_MANAGE = 'employees.manage',

  // Patients
  PATIENTS_READ = 'patients.read',
  PATIENTS_CREATE = 'patients.create',
  PATIENTS_UPDATE = 'patients.update',
  PATIENTS_MERGE = 'patients.merge',
  PATIENTS_EXPORT = 'patients.export',

  // Scheduling
  APPOINTMENTS_READ = 'appointments.read',
  APPOINTMENTS_CREATE = 'appointments.create',
  APPOINTMENTS_UPDATE = 'appointments.update',
  APPOINTMENTS_CANCEL = 'appointments.cancel',
  APPOINTMENTS_MODIFY_PAST = 'appointments.modify_past',

  // Clinical
  CLINICAL_READ = 'clinical.read',
  CLINICAL_WRITE = 'clinical.write',
  CLINICAL_SIGN = 'clinical.sign',
  CLINICAL_AMEND = 'clinical.amend',

  // Finance
  FINANCE_READ = 'finance.read',
  FINANCE_PAYMENT_CREATE = 'finance.payment.create',
  FINANCE_PAYMENT_REFUND = 'finance.payment.refund',
  FINANCE_LEDGER_ADJUST = 'finance.ledger.adjust',

  // Inventory
  INVENTORY_READ = 'inventory.read',
  INVENTORY_RECEIVE = 'inventory.receive',
  INVENTORY_TRANSFER = 'inventory.transfer',
  INVENTORY_WRITEOFF = 'inventory.writeoff',
  INVENTORY_ADJUST = 'inventory.adjust',

  // Compensation
  COMPENSATION_READ_OWN = 'compensation.read_own',
  COMPENSATION_READ_ALL = 'compensation.read_all',

  // Audit
  AUDIT_READ = 'audit.read'
}

export enum StandardRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  CLINIC_OWNER = 'CLINIC_OWNER',
  CLINIC_ADMIN = 'CLINIC_ADMIN',
  DOCTOR = 'DOCTOR',
  ASSISTANT = 'ASSISTANT',
  RECEPTIONIST = 'RECEPTIONIST',
  CASHIER = 'CASHIER',
  PATIENT = 'PATIENT'
}

export const DEFAULT_ROLE_PERMISSIONS: Record<StandardRole, PermissionKey[]> = {
  [StandardRole.SUPER_ADMIN]: Object.values(PermissionKey),
  [StandardRole.CLINIC_OWNER]: Object.values(PermissionKey),
  [StandardRole.CLINIC_ADMIN]: [
    PermissionKey.ORGANIZATION_MANAGE,
    PermissionKey.BRANCH_MANAGE,
    PermissionKey.CHAIR_MANAGE,
    PermissionKey.USERS_READ,
    PermissionKey.USERS_MANAGE,
    PermissionKey.ROLES_MANAGE,
    PermissionKey.EMPLOYEES_READ,
    PermissionKey.EMPLOYEES_MANAGE,
    PermissionKey.PATIENTS_READ,
    PermissionKey.PATIENTS_CREATE,
    PermissionKey.PATIENTS_UPDATE,
    PermissionKey.PATIENTS_EXPORT,
    PermissionKey.APPOINTMENTS_READ,
    PermissionKey.APPOINTMENTS_CREATE,
    PermissionKey.APPOINTMENTS_UPDATE,
    PermissionKey.APPOINTMENTS_CANCEL,
    PermissionKey.FINANCE_READ,
    PermissionKey.FINANCE_PAYMENT_CREATE,
    PermissionKey.INVENTORY_READ,
    PermissionKey.AUDIT_READ
  ],
  [StandardRole.DOCTOR]: [
    PermissionKey.PATIENTS_READ,
    PermissionKey.PATIENTS_UPDATE,
    PermissionKey.APPOINTMENTS_READ,
    PermissionKey.APPOINTMENTS_UPDATE,
    PermissionKey.CLINICAL_READ,
    PermissionKey.CLINICAL_WRITE,
    PermissionKey.CLINICAL_SIGN,
    PermissionKey.COMPENSATION_READ_OWN
  ],
  [StandardRole.ASSISTANT]: [
    PermissionKey.PATIENTS_READ,
    PermissionKey.APPOINTMENTS_READ,
    PermissionKey.CLINICAL_READ,
    PermissionKey.INVENTORY_READ
  ],
  [StandardRole.RECEPTIONIST]: [
    PermissionKey.PATIENTS_READ,
    PermissionKey.PATIENTS_CREATE,
    PermissionKey.PATIENTS_UPDATE,
    PermissionKey.APPOINTMENTS_READ,
    PermissionKey.APPOINTMENTS_CREATE,
    PermissionKey.APPOINTMENTS_UPDATE,
    PermissionKey.APPOINTMENTS_CANCEL,
    PermissionKey.FINANCE_READ,
    PermissionKey.FINANCE_PAYMENT_CREATE
  ],
  [StandardRole.CASHIER]: [
    PermissionKey.PATIENTS_READ,
    PermissionKey.FINANCE_READ,
    PermissionKey.FINANCE_PAYMENT_CREATE,
    PermissionKey.FINANCE_PAYMENT_REFUND
  ],
  [StandardRole.PATIENT]: [
    PermissionKey.APPOINTMENTS_READ
  ]
};
