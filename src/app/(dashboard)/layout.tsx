import { redirect } from "next/navigation";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { ReadOnlyBanner } from "@/components/layout/read-only-banner";
import { requireUser } from "@/modules/auth/repository";
import { getOrganizationContext, listCurrentUserMemberships } from "@/modules/organizations/repository";
import { isCurrentUserSuperAdmin } from "@/modules/platform-admin/repository";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [memberships, isSuperAdmin] = await Promise.all([
    listCurrentUserMemberships(user.id),
    isCurrentUserSuperAdmin(),
  ]);
  const context = await getOrganizationContext(memberships);
  if (!context) redirect(isSuperAdmin ? "/admin/organizations" : "/onboarding");

  return (
    <div className="min-h-screen">
      <DashboardSidebar
        canReadClinical={context.can("clinical.read")}
        canReadFinance={context.can("finance.read")}
        canReadCrm={context.can("crm.read")}
        canReadTasks={context.can("tasks.read")}
        canReadRecalls={context.can("recalls.read")}
        canReadCommunications={context.can("communications.read")}
        canReadAutomation={context.can("automation.read")}
        canReadDocuments={context.can("documents.read")}
        canReadInventory={context.can("inventory.read")}
        canReadReports={context.can("reports.read")}
        canAccessAdmin={isSuperAdmin}
      />
      <div className="lg:pl-64">
        <DashboardHeader activeOrganizationId={context.organization.id} memberships={memberships} userEmail={user.email ?? "user"} userId={user.id} />
        <ReadOnlyBanner organization={context.organization} />
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
