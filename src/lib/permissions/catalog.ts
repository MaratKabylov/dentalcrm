export const PERMISSIONS = [
  "patients.read",
  "patients.create",
  "patients.update",
  "patients.delete",
  "appointments.read",
  "appointments.manage",
  "clinical.read",
  "clinical.write",
  "treatment_plan.manage",
  "finance.read",
  "finance.manage",
  "cashdesk.manage",
  "crm.read",
  "crm.manage",
  "tasks.read",
  "tasks.manage",
  "recalls.read",
  "recalls.manage",
  "communications.read",
  "communications.manage",
  "automation.read",
  "automation.manage",
  "documents.read",
  "documents.manage",
  "inventory.read",
  "inventory.manage",
  "reports.read",
  "payroll.read",
  "payroll.manage",
  "settings.manage",
  "users.manage",
  "audit.read",
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

export const WRITE_PERMISSIONS = new Set<PermissionCode>([
  "patients.create",
  "patients.update",
  "patients.delete",
  "appointments.manage",
  "clinical.write",
  "treatment_plan.manage",
  "finance.manage",
  "cashdesk.manage",
  "crm.manage",
  "tasks.manage",
  "recalls.manage",
  "communications.manage",
  "automation.manage",
  "documents.manage",
  "inventory.manage",
  "payroll.manage",
  "settings.manage",
  "users.manage",
]);

export function hasPermission(
  permissions: ReadonlySet<string>,
  permission: PermissionCode,
) {
  return permissions.has(permission);
}

export function isWritePermission(permission: PermissionCode) {
  return WRITE_PERMISSIONS.has(permission);
}
