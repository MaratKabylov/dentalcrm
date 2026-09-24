"use client";

import { useActionState } from "react";
import { ListPlus, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initialFormState } from "@/modules/auth/types";
import { generateDueRecallTasks } from "@/modules/recalls/actions";

export function RecallTaskGenerator({ pendingCount }: { pendingCount: number }) {
  const [state, formAction, pending] = useActionState(generateDueRecallTasks, initialFormState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <Button variant="secondary" disabled={pending || pendingCount === 0}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ListPlus className="size-4" />}
        {pending ? "Формирование…" : `Сформировать задачи${pendingCount > 0 ? ` · ${pendingCount}` : ""}`}
      </Button>
      {state.message && <span role="status" className={state.status === "error" ? "text-xs text-[var(--danger)]" : "text-xs text-emerald-700"}>{state.message}</span>}
    </form>
  );
}
