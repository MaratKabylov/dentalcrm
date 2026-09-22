import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { getCurrentUser } from "@/modules/auth/repository";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div>
      <p className="text-sm font-semibold text-[var(--brand)]">Добро пожаловать</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Вход в клинику</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        Используйте учётную запись, на которую администратор выдал доступ.
      </p>
      <LoginForm />
      <p className="mt-8 text-center text-xs leading-5 text-[var(--muted)]">
        Доступ к медицинским данным журналируется и защищён политиками клиники.
      </p>
    </div>
  );
}
