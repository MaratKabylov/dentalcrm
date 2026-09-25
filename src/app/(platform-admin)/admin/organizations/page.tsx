import type { Metadata } from "next";

import { OrganizationsAdmin } from "@/modules/platform-admin/organizations-admin";
import { listPlatformAdminAuditLogs, listPlatformOrganizations } from "@/modules/platform-admin/repository";

export const metadata: Metadata = { title: "Организации — Администрирование" };

export default async function AdminOrganizationsPage() {
  const [organizations, auditLogs] = await Promise.all([
    listPlatformOrganizations(),
    listPlatformAdminAuditLogs(),
  ]);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const expiringThrough = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-semibold text-[var(--brand)]">Управление сервисом</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Организации</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">Контролируйте срок и режим доступа. При блокировке данные остаются доступными для просмотра и экспорта.</p>
      </div>
      <OrganizationsAdmin organizations={organizations} auditLogs={auditLogs} today={today} expiringThrough={expiringThrough} />
    </div>
  );
}
