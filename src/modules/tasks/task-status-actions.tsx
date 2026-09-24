"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initialFormState } from "@/modules/auth/types";
import { setTaskStatus } from "@/modules/tasks/actions";
import { taskStatusOptions } from "@/modules/tasks/constants";
import type { TaskStatus } from "@/modules/tasks/types";

export function TaskStatusActions({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const [state, formAction, pending] = useActionState(setTaskStatus, initialFormState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <select name="status" defaultValue={status} className="h-9 rounded-xl border bg-white px-3 text-xs font-medium">
        {taskStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <Button variant="secondary" className="h-9 px-3 text-xs" disabled={pending}>
        {pending && <LoaderCircle className="size-3.5 animate-spin" />}
        Обновить
      </Button>
      {state.status === "error" && <span role="alert" className="w-full text-xs text-[var(--danger)]">{state.message}</span>}
    </form>
  );
}
