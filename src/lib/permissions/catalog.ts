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
  "inventory.read",
  "inventory.manage",
  "reports.read",
  "settings.manage",
  "users.manage",
  "audit.read",
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

export function hasPermission(
  permissions: ReadonlySet<string>,
  permission: PermissionCode,
) {
  return permissions.has(permission);
}
