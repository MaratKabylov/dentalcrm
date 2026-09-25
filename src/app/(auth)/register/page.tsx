import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/auth/repository";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const query = await searchParams;
  const nextPath = query.next?.startsWith("/") && !query.next.startsWith("//") ? query.next : "/onboarding";
  const user = await getCurrentUser();
  if (user) redirect(nextPath);

  return (
    <div>
      <p className="text-sm font-semibold text-[var(--brand)]">Новая клиника</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Создайте аккаунт</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        После регистрации вы создадите организацию и станете её владельцем.
      </p>
      <RegisterForm nextPath={nextPath} defaultEmail={query.email ?? ""} />
      <p className="mt-7 text-center text-xs leading-5 text-[var(--muted)]">
        Регистрируясь, вы соглашаетесь использовать сервис только для законной обработки данных пациентов.
      </p>
    </div>
  );
}
