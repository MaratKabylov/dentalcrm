"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import type { BranchOption } from "@/modules/patients/types";
import { createDoctor } from "@/modules/scheduling/actions";
import type { MemberOption } from "@/modules/scheduling/types";

function ErrorText({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <span className="text-xs text-[var(--danger)]">{errors[0]}</span> : null;
}

export function CreateDoctorForm({ branches, members }: { branches: BranchOption[]; members: MemberOption[] }) {
  const [state, action, pending] = useActionState(createDoctor, initialFormState);

  return (
    <form action={action} className="space-y-7">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Филиал *</span>
          <select name="branchId" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required>
            <option value="">Выберите филиал</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <ErrorText errors={state.fieldErrors?.branchId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">ФИО врача *</span>
          <Input name="fullName" placeholder="Алия Сериковна Ахметова" required />
          <ErrorText errors={state.fieldErrors?.fullName} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Аккаунт врача</span>
          <select name="profileId" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Не связывать</option>
            {members.map((member) => <option key={member.userId} value={member.userId}>{member.fullName || `Пользователь ${member.userId.slice(0, 8)}`}</option>)}
          </select>
          <span className="block text-xs text-[var(--muted)]">Связанный аккаунт получит уведомление, когда пациент прибудет.</span>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Специализация *</span>
          <Input name="specialization" placeholder="Стоматолог-терапевт" required />
          <ErrorText errors={state.fieldErrors?.specialization} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Кабинет *</span>
          <Input name="roomName" placeholder="Кабинет 1" required />
          <ErrorText errors={state.fieldErrors?.roomName} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Длительность приёма</span>
          <select name="durationMinutes" defaultValue="30" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            {[15, 20, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} минут</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Цвет в календаре</span>
          <Input name="color" type="color" defaultValue="#087f6d" className="p-1.5" />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Начало рабочего дня</span>
          <Input name="workdayStart" type="time" defaultValue="09:00" required />
          <ErrorText errors={state.fieldErrors?.workdayStart} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Конец рабочего дня</span>
          <Input name="workdayEnd" type="time" defaultValue="18:00" required />
          <ErrorText errors={state.fieldErrors?.workdayEnd} />
        </label>
      </div>
      <p className="rounded-xl bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">
        Будет создан стандартный график с понедельника по пятницу. Исключения и отпуска можно будет добавить отдельно.
      </p>
      {state.message && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{state.message}</div>}
      <div className="flex justify-end">
        <Button disabled={pending} className="min-w-40">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pending ? "Сохранение…" : "Добавить врача"}
        </Button>
      </div>
    </form>
  );
}
