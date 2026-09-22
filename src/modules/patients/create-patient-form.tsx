"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { createPatient } from "@/modules/patients/actions";
import type { BranchOption } from "@/modules/patients/types";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

export function CreatePatientForm({ branches }: { branches: BranchOption[] }) {
  const [state, formAction, pending] = useActionState(createPatient, initialFormState);

  return (
    <form action={formAction} className="space-y-7">
      <div className="grid gap-5 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-sm font-medium">Фамилия *</span>
          <Input name="lastName" autoComplete="family-name" required />
          <FieldError errors={state.fieldErrors?.lastName} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Имя *</span>
          <Input name="firstName" autoComplete="given-name" required />
          <FieldError errors={state.fieldErrors?.firstName} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Отчество</span>
          <Input name="middleName" autoComplete="additional-name" />
          <FieldError errors={state.fieldErrors?.middleName} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Телефон *</span>
          <Input name="phone" type="tel" autoComplete="tel" placeholder="+7 700 000 00 00" required />
          <FieldError errors={state.fieldErrors?.phone} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">ИИН</span>
          <Input name="iin" inputMode="numeric" maxLength={12} placeholder="12 цифр" />
          <FieldError errors={state.fieldErrors?.iin} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Email</span>
          <Input name="email" type="email" autoComplete="email" />
          <FieldError errors={state.fieldErrors?.email} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Дата рождения</span>
          <Input name="birthDate" type="date" />
          <FieldError errors={state.fieldErrors?.birthDate} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Пол</span>
          <select name="gender" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Не указан</option>
            <option value="female">Женский</option>
            <option value="male">Мужской</option>
          </select>
          <FieldError errors={state.fieldErrors?.gender} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Основной филиал</span>
          <select name="primaryBranchId" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Не выбран</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.primaryBranchId} />
        </label>
      </div>

      <div className="space-y-3 rounded-xl bg-[var(--surface-muted)] p-4">
        <label className="flex items-start gap-3 text-sm">
          <input name="consentPersonalData" type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>Получено согласие на обработку персональных данных</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input name="consentMarketing" type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>Получено согласие на маркетинговые сообщения</span>
        </label>
      </div>

      {state.message && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">
          {state.message}
        </div>
      )}

      <div className="flex justify-end">
        <Button className="min-w-44" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pending ? "Сохранение…" : "Создать пациента"}
        </Button>
      </div>
    </form>
  );
}
