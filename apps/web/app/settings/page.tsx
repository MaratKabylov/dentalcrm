import { SettingsWorkspace } from "./settings-workspace";

export default function SettingsPage() {
  return <SettingsWorkspace apiUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"}
    tenantId={process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? ""}
    subject={process.env.NEXT_PUBLIC_DEMO_USER_SUBJECT ?? "local-owner"} />;
}
