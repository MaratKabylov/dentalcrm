"use client";

import { useActionState } from "react";
import { ArrowRight, Building2, LoaderCircle, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { createOrganization } from "@/modules/organizations/actions";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createOrganization,
    initialFormState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium">Название клиники</span>
        <div className="relative">
          <Building2 className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" />
          <Input name="name" placeholder="Например, Nova Dental" className="pl-10" required />
        </div>
        {state.fieldErrors?.name?.[0] && (
          <span className="text-xs text-[var(--danger)]">{state.fieldErrors.name[0]}</span>
        )}
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Первый филиал</span>
        <div className="relative">
          <MapPin className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" />
          <Input name="branchName" placeholder="Главный филиал" className="pl-10" required />
        </div>
        {state.fieldErrors?.branchName?.[0] && (
          <span className="text-xs text-[var(--danger)]">{state.fieldErrors.branchName[0]}</span>
        )}
      </label>
      {state.message && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">
          {state.message}
        </div>
      )}
      <Button className="h-11 w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <>Создать пространство <ArrowRight className="size-4" /></>}
      </Button>
    </form>
  );
}
