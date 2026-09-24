export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type TaskRelationType = "lead" | "patient";

export type TaskOption = {
  id: string;
  name: string;
};

export type TaskAssignee = {
  id: string;
  fullName: string;
};

export type TaskRelationOption = {
  type: TaskRelationType;
  id: string;
  label: string;
  secondary: string;
};

export type TaskListItem = {
  id: string;
  branchId: string | null;
  branchName: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo: string | null;
  assigneeName: string | null;
  creatorName: string;
  dueAt: string | null;
  isOverdue: boolean;
  relatedEntityType: TaskRelationType | null;
  relatedEntityId: string | null;
  relatedEntityName: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TaskFilters = {
  q?: string;
  status?: TaskStatus | "all" | "open";
  priority?: TaskPriority | "all";
  assignee?: string;
  due?: "all" | "overdue" | "today" | "no_due";
};

export type TaskSummary = {
  active: number;
  overdue: number;
  dueToday: number;
  completed: number;
};
