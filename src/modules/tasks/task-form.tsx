"use client";

import { useActionState, useMemo, useState } from "react";
import { ClipboardPlus, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { saveTask } from "@/modules/tasks/actions";
import { taskPriorityOptions } from "@/modules/tasks/constants";
import type {
  TaskAssignee,
  TaskOption,
  TaskRelationOption,
  TaskRelationType,
} from "@/modules/tasks/types";

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <span className="text-xs text-[var(--danger)]">{errors[0]}</span> : null;
}

export function TaskForm({
  branches,
  assignees,
  relations,
  defaultRelationType,
  defaultRelationId,
}: {
  branches: TaskOption[];
  assignees: TaskAssignee[];
  relations: TaskRelationOption[];
  defaultRelationType?: TaskRelationType;
  defaultRelationId?: string;
}) {
  const [state, formAction, pending] = useActionState(saveTask, initialFormState);
  const [relationType, setRelationType] = useState<TaskRelationType | "">(defaultRelationType ?? "");
  const availableRelations = useMemo(
    () => relations.filter((relation) => relation.type === relationType),
    [relationType, relations],
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">Название *</span>
          <Input name="title" maxLength={240} placeholder="Например, позвонить и подтвердить визит" required />
          <FieldError errors={state.fieldErrors?.title} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Приоритет *</span>
          <select name="priority" defaultValue="normal" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required>
            {taskPriorityOptions.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.priority} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Исполнитель</span>
          <select name="assignedTo" defaultValue="" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Не назначен</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.fullName}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.assignedTo} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Филиал</span>
          <select name="branchId" defaultValue="" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Без филиала</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.branchId} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-2">
            <span className="text-sm font-medium">Срок: дата</span>
            <Input name="dueDate" type="date" />
            <FieldError errors={state.fieldErrors?.dueDate} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Время</span>
            <Input name="dueTime" type="time" step={300} />
            <FieldError errors={state.fieldErrors?.dueTime} />
          </label>
        </div>

        <label className="space-y-2">
          <span className="text-sm font-medium">Связать с</span>
          <select
            name="relatedEntityType"
            value={relationType}
            onChange={(event) => setRelationType(event.target.value as TaskRelationType | "")}
            className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm"
          >
            <option value="">Без связи</option>
            <option value="patient">Пациентом</option>
            <option value="lead">Лидом</option>
          </select>
          <FieldError errors={state.fieldErrors?.relatedEntityType} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Связанная запись</span>
          <select
            key={relationType}
            name="relatedEntityId"
            defaultValue={relationType === defaultRelationType ? defaultRelationId ?? "" : ""}
            disabled={!relationType}
            className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm disabled:bg-[var(--surface-muted)]"
          >
            <option value="">{relationType ? "Выберите запись" : "Сначала выберите тип"}</option>
            {availableRelations.map((relation) => (
              <option key={relation.id} value={relation.id}>{relation.label} · {relation.secondary}</option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors?.relatedEntityId} />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Описание</span>
        <textarea name="description" rows={5} maxLength={5000} className="w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" />
        <FieldError errors={state.fieldErrors?.description} />
      </label>

      {state.message && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{state.message}</div>}

      <div className="flex justify-end">
        <Button className="min-w-40" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ClipboardPlus className="size-4" />}
          {pending ? "Создание…" : "Создать задачу"}
        </Button>
      </div>
    </form>
  );
}
