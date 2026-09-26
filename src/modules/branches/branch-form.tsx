"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { saveBranch } from "@/modules/branches/actions";
import type { BranchListItem } from "@/modules/branches/types";

type EditableBranch = Omit<BranchListItem, "roomsCount" | "employeesCount">;

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <span className="text-xs text-[var(--danger)]">{errors[0]}</span> : null;
}

export function BranchForm({ branch }: { branch?: EditableBranch }) {
  const [state, action, pending] = useActionState(saveBranch, initialFormState);

  return (
    <form action={action} className="space-y-6">
      {branch && <input type="hidden" name="branchId" value={branch.id} />}
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Название *</span>
          <Input name="name" defaultValue={branch?.name ?? ""} maxLength={120} required />
          <FieldError errors={state.fieldErrors?.name} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Часовой пояс *</span>
          <Input name="timezone" defaultValue={branch?.timezone ?? "Asia/Qyzylorda"} list="branch-timezones" required />
          <datalist id="branch-timezones">
            <option value="Asia/Qyzylorda" />
            <option value="Asia/Almaty" />
            <option value="Asia/Aqtobe" />
            <option value="Asia/Aqtau" />
            <option value="Asia/Oral" />
          </datalist>
          <FieldError errors={state.fieldErrors?.timezone} />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">Адрес</span>
          <Input name="address" defaultValue={branch?.address ?? ""} maxLength={500} />
          <FieldError errors={state.fieldErrors?.address} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Телефон</span>
          <Input name="phone" type="tel" defaultValue={branch?.phone ?? ""} maxLength={40} />
          <FieldError errors={state.fieldErrors?.phone} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Email</span>
          <Input name="email" type="email" defaultValue={branch?.email ?? ""} maxLength={200} />
          <FieldError errors={state.fieldErrors?.email} />
        </label>
      </div>
      {state.message && <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]" : "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"}>{state.message}</p>}
      <div className="flex justify-end"><Button disabled={pending} className="min-w-40">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Сохранение…" : "Сохранить"}</Button></div>
    </form>
  );
}
