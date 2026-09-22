import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "@/modules/auth/repository";
import { listCurrentUserMemberships } from "@/modules/organizations/repository";

import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Создание клиники" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const memberships = await listCurrentUserMemberships(user.id);
  if (memberships.length > 0) redirect("/dashboard");

  return (
    <div>
      <p className="text-sm font-semibold text-[var(--brand)]">Первичная настройка</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Создайте пространство клиники</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        Вы станете владельцем организации. Дополнительные филиалы и сотрудников можно добавить позже.
      </p>
      <OnboardingForm />
    </div>
  );
}
