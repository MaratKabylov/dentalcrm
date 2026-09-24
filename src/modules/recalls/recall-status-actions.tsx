"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initialFormState } from "@/modules/auth/types";
import { setRecallStatus } from "@/modules/recalls/actions";
import { recallStatusOptions } from "@/modules/recalls/constants";
import type { RecallStatus } from "@/modules/recalls/types";

export function RecallStatusActions({ recallId, status }: { recallId: string; status: RecallStatus }) {
  const [state, formAction, pending] = useActionState(setRecallStatus, initialFormState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="recallId" value={recallId} />
      <select name="status" defaultValue={status} className="h-9 rounded-xl border bg-white px-3 text-xs font-medium">
        {recallStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <Button variant="secondary" className="h-9 px-3 text-xs" disabled={pending}>
        {pending && <LoaderCircle className="size-3.5 animate-spin" />}
        Обновить
      </Button>
      {state.status === "error" && <span role="alert" className="w-full text-xs text-[var(--danger)]">{state.message}</span>}
    </form>
  );
}
