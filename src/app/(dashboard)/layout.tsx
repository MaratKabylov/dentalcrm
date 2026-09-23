import { redirect } from "next/navigation";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { requireUser } from "@/modules/auth/repository";
import { getOrganizationContext, listCurrentUserMemberships } from "@/modules/organizations/repository";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const memberships = await listCurrentUserMemberships(user.id);
  const context = await getOrganizationContext(memberships);
  if (!context) redirect("/onboarding");

  return (
    <div className="min-h-screen">
      <DashboardSidebar canReadClinical={context.can("clinical.read")} />
      <div className="lg:pl-64">
        <DashboardHeader activeOrganizationId={context.organization.id} memberships={memberships} userEmail={user.email ?? "user"} userId={user.id} />
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
