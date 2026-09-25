import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { getCurrentUser } from "@/modules/auth/repository";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const query = await searchParams;
  const nextPath = query.next?.startsWith("/") && !query.next.startsWith("//") ? query.next : "/dashboard";
  const user = await getCurrentUser();
  if (user) redirect(nextPath);

  return (
    <div>
      <p className="text-sm font-semibold text-[var(--brand)]">Добро пожаловать</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Вход в клинику</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        Используйте учётную запись, на которую администратор выдал доступ.
      </p>
      <LoginForm nextPath={nextPath} defaultEmail={query.email ?? ""} />
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        Нет аккаунта? <Link href={`/register?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(query.email ?? "")}`} className="font-semibold text-[var(--brand-dark)] hover:underline">Зарегистрироваться</Link>
      </p>
      <p className="mt-8 text-center text-xs leading-5 text-[var(--muted)]">
        Доступ к медицинским данным журналируется и защищён политиками клиники.
      </p>
    </div>
  );
}
