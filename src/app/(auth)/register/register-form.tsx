"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { register } from "@/modules/auth/actions";
import { initialFormState } from "@/modules/auth/types";

export function RegisterForm({ nextPath = "/onboarding", defaultEmail = "" }: { nextPath?: string; defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState(register, initialFormState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={nextPath} />
      <label className="block space-y-2">
        <span className="text-sm font-medium">Имя и фамилия</span>
        <div className="relative">
          <UserRound className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" />
          <Input name="fullName" autoComplete="name" placeholder="Марат Кабылов" className="pl-10" required />
        </div>
        {state.fieldErrors?.fullName?.[0] && <span className="text-xs text-[var(--danger)]">{state.fieldErrors.fullName[0]}</span>}
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Email</span>
        <div className="relative">
          <Mail className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" />
          <Input name="email" type="email" autoComplete="email" placeholder="name@clinic.kz" className="pl-10" defaultValue={defaultEmail} required />
        </div>
        {state.fieldErrors?.email?.[0] && <span className="text-xs text-[var(--danger)]">{state.fieldErrors.email[0]}</span>}
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Пароль</span>
          <div className="relative">
            <LockKeyhole className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" />
            <Input name="password" type="password" autoComplete="new-password" placeholder="От 8 символов" className="pl-10" required minLength={8} />
          </div>
          {state.fieldErrors?.password?.[0] && <span className="text-xs text-[var(--danger)]">{state.fieldErrors.password[0]}</span>}
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Ещё раз</span>
          <div className="relative">
            <LockKeyhole className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" />
            <Input name="passwordConfirmation" type="password" autoComplete="new-password" placeholder="Повторите пароль" className="pl-10" required minLength={8} />
          </div>
          {state.fieldErrors?.passwordConfirmation?.[0] && <span className="text-xs text-[var(--danger)]">{state.fieldErrors.passwordConfirmation[0]}</span>}
        </label>
      </div>

      {state.message && (
        <div role={state.status === "error" ? "alert" : "status"} className={state.status === "success" ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800" : "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"}>
          {state.message}
        </div>
      )}

      <Button className="h-11 w-full" disabled={pending || state.status === "success"}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <>Создать аккаунт <ArrowRight className="size-4" /></>}
      </Button>

      <p className="text-center text-sm text-[var(--muted)]">
        Уже есть аккаунт? <Link href={`/login?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(defaultEmail)}`} className="font-semibold text-[var(--brand-dark)] hover:underline">Войти</Link>
      </p>
    </form>
  );
}
