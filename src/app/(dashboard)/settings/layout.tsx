import { SettingsNav } from "@/components/layout/settings-nav";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const context = await getOrganizationContext();

  return (
    <div className="mx-auto max-w-6xl">
      <SettingsNav
        canManageUsers={context?.can("users.manage") ?? false}
        canManageSettings={context?.can("settings.manage") ?? false}
        canManageBranches={context?.can("branches.manage") ?? false}
      />
      {children}
    </div>
  );
}
