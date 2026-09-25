"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { updateOrganizationAccess } from "@/modules/platform-admin/actions";
import type { PlatformOrganization } from "@/modules/platform-admin/types";

function SaveButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Сохранение…" : "Сохранить доступ"}</Button>;
}

export function OrganizationAccessForm({ organization }: { organization: PlatformOrganization }) {
  const [state, action] = useActionState(updateOrganizationAccess, initialFormState);

  return (
    <form action={action} className="grid gap-4 border-t bg-[var(--surface-muted)]/55 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_auto] lg:items-end">
      <input type="hidden" name="organizationId" value={organization.id} />
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Доступ до</span>
        <Input name="accessUntil" type="date" defaultValue={organization.accessUntil} required />
        {state.fieldErrors?.accessUntil?.[0] && <span className="mt-1 block text-xs text-[var(--danger)]">{state.fieldErrors.accessUntil[0]}</span>}
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Режим</span>
        <select name="mode" defaultValue={organization.accessState === "suspended" ? "read_only" : "active"} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
          <option value="active">Полный доступ</option>
          <option value="read_only">Только чтение</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Причина блокировки</span>
        <Input name="reason" defaultValue={organization.suspensionReason ?? ""} placeholder="Обязательна для режима чтения" />
        {state.fieldErrors?.reason?.[0] && <span className="mt-1 block text-xs text-[var(--danger)]">{state.fieldErrors.reason[0]}</span>}
      </label>
      <SaveButton />
      {state.message && (
        <p role="status" className={`text-xs sm:col-span-2 lg:col-span-4 ${state.status === "success" ? "text-emerald-700" : "text-[var(--danger)]"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
