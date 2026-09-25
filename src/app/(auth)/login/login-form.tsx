"use client";

import { useActionState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "@/modules/auth/actions";
import { initialFormState } from "@/modules/auth/types";

export function LoginForm({ nextPath = "/dashboard", defaultEmail = "" }: { nextPath?: string; defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState(login, initialFormState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={nextPath} />
      <label className="block space-y-2">
        <span className="text-sm font-medium">Email</span>
        <div className="relative">
          <Mail className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" />
          <Input name="email" type="email" autoComplete="email" placeholder="name@clinic.kz" className="pl-10" defaultValue={defaultEmail} required />
        </div>
        {state.fieldErrors?.email?.[0] && (
          <span className="text-xs text-[var(--danger)]">{state.fieldErrors.email[0]}</span>
        )}
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Пароль</span>
        <div className="relative">
          <LockKeyhole className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" />
          <Input name="password" type="password" autoComplete="current-password" placeholder="Не менее 8 символов" className="pl-10" required />
        </div>
        {state.fieldErrors?.password?.[0] && (
          <span className="text-xs text-[var(--danger)]">{state.fieldErrors.password[0]}</span>
        )}
      </label>
      {state.message && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">
          {state.message}
        </div>
      )}
      <Button className="h-11 w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <>Войти <ArrowRight className="size-4" /></>}
      </Button>
    </form>
  );
}
