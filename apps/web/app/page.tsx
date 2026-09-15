import { ClinicDashboard } from "./clinic-dashboard";

export default function Home() {
  return <ClinicDashboard apiUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"}
    tenantId={process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? ""}
    subject={process.env.NEXT_PUBLIC_DEMO_USER_SUBJECT ?? "local-owner"} />;
}
