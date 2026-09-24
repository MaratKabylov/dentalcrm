import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { requirePermission } from "@/modules/organizations/repository";
import { listTaskAssignees, listTaskBranches, listTaskRelationOptions } from "@/modules/tasks/repository";
import { taskRelationDefaultsSchema } from "@/modules/tasks/schemas";
import { TaskForm } from "@/modules/tasks/task-form";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; patientId?: string }>;
}) {
  await requirePermission("tasks.manage");
  const query = await searchParams;
  const parsedDefaults = taskRelationDefaultsSchema.safeParse(query);
  const requestedDefault = parsedDefaults.success ? parsedDefaults.data : { type: undefined, id: undefined };
  const [branches, assignees, relations] = await Promise.all([
    listTaskBranches(),
    listTaskAssignees(),
    listTaskRelationOptions(),
  ]);
  const hasRequestedRelation = relations.some(
    (relation) => relation.type === requestedDefault.type && relation.id === requestedDefault.id,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/crm/tasks" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К задачам</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Новая задача</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Назначьте исполнителя, срок и при необходимости свяжите задачу с пациентом или лидом.</p>
      </div>
      <Card className="p-5 lg:p-7">
        <TaskForm
          branches={branches}
          assignees={assignees}
          relations={relations}
          defaultRelationType={hasRequestedRelation ? requestedDefault.type : undefined}
          defaultRelationId={hasRequestedRelation ? requestedDefault.id : undefined}
        />
      </Card>
    </div>
  );
}
