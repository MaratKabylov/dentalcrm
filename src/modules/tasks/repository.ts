import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/organizations/repository";
import { taskPrioritySchema, taskRelationTypeSchema, taskStatusSchema } from "@/modules/tasks/schemas";
import type {
  TaskAssignee,
  TaskFilters,
  TaskListItem,
  TaskOption,
  TaskRelationOption,
  TaskSummary,
} from "@/modules/tasks/types";

const taskRowSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid().nullable(),
  branch_name: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  assigned_to: z.uuid().nullable(),
  assignee_name: z.string().nullable(),
  creator_name: z.string(),
  due_at: z.string().nullable(),
  is_overdue: z.boolean(),
  related_entity_type: taskRelationTypeSchema.nullable(),
  related_entity_id: z.uuid().nullable(),
  related_entity_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
});

const assigneeRowSchema = z.object({ id: z.uuid(), full_name: z.string() });
const optionRowSchema = z.object({ id: z.uuid(), name: z.string() });
const relationRowSchema = z.object({
  entity_type: taskRelationTypeSchema,
  id: z.uuid(),
  label: z.string(),
  secondary: z.string(),
});
const summaryRowSchema = z.object({
  active_count: z.coerce.number().int().nonnegative(),
  overdue_count: z.coerce.number().int().nonnegative(),
  due_today_count: z.coerce.number().int().nonnegative(),
  completed_count: z.coerce.number().int().nonnegative(),
});

function toTask(row: z.infer<typeof taskRowSchema>): TaskListItem {
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    assigneeName: row.assignee_name,
    creatorName: row.creator_name,
    dueAt: row.due_at,
    isOverdue: row.is_overdue,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    relatedEntityName: row.related_entity_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export async function listTasks(filters: TaskFilters = {}): Promise<TaskListItem[]> {
  const context = await requirePermission("tasks.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_tasks", {
    org_id: context.organization.id,
    search_query: filters.q || null,
    status_filter: filters.status && filters.status !== "all" ? filters.status : null,
    priority_filter: filters.priority && filters.priority !== "all" ? filters.priority : null,
    assignee_filter: filters.assignee ?? null,
    due_filter: filters.due && filters.due !== "all" ? filters.due : null,
    result_limit: 300,
  });
  if (error) throw new AppError("TASKS_LOAD_FAILED", "Не удалось загрузить задачи.");
  const parsed = z.array(taskRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_TASK_DATA", "Получены некорректные данные задач.");
  return parsed.data.map(toTask);
}

export async function getTaskSummary(): Promise<TaskSummary> {
  const context = await requirePermission("tasks.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_task_summary", { org_id: context.organization.id });
  if (error) throw new AppError("TASK_SUMMARY_LOAD_FAILED", "Не удалось загрузить сводку задач.");
  const parsed = z.array(summaryRowSchema).safeParse(data ?? []);
  if (!parsed.success || !parsed.data[0]) {
    throw new AppError("INVALID_TASK_SUMMARY_DATA", "Получена некорректная сводка задач.");
  }
  return {
    active: parsed.data[0].active_count,
    overdue: parsed.data[0].overdue_count,
    dueToday: parsed.data[0].due_today_count,
    completed: parsed.data[0].completed_count,
  };
}

export async function listTaskAssignees(): Promise<TaskAssignee[]> {
  const context = await requirePermission("tasks.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_task_assignees", { org_id: context.organization.id });
  if (error) throw new AppError("TASK_ASSIGNEES_LOAD_FAILED", "Не удалось загрузить исполнителей.");
  const parsed = z.array(assigneeRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_TASK_ASSIGNEE_DATA", "Получены некорректные данные исполнителей.");
  return parsed.data.map((row) => ({ id: row.id, fullName: row.full_name }));
}

export async function listTaskBranches(): Promise<TaskOption[]> {
  const context = await requirePermission("tasks.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_task_branches", { org_id: context.organization.id });
  if (error) throw new AppError("TASK_BRANCHES_LOAD_FAILED", "Не удалось загрузить филиалы.");
  const parsed = z.array(optionRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_TASK_BRANCH_DATA", "Получены некорректные данные филиалов.");
  return parsed.data;
}

export async function listTaskRelationOptions(): Promise<TaskRelationOption[]> {
  const context = await requirePermission("tasks.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_task_relation_options", { org_id: context.organization.id });
  if (error) throw new AppError("TASK_RELATIONS_LOAD_FAILED", "Не удалось загрузить связанные записи.");
  const parsed = z.array(relationRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_TASK_RELATION_DATA", "Получены некорректные связанные записи.");
  return parsed.data.map((row) => ({
    type: row.entity_type,
    id: row.id,
    label: row.label,
    secondary: row.secondary,
  }));
}
