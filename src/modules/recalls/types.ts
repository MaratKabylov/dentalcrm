export type RecallType =
  | "hygiene"
  | "control_visit"
  | "orthodontics"
  | "implant_check"
  | "unfinished_treatment"
  | "other";

export type RecallStatus =
  | "scheduled"
  | "due"
  | "contacted"
  | "booked"
  | "completed"
  | "cancelled";

export type RecallPatientOption = {
  id: string;
  label: string;
  secondary: string;
};

export type RecallDoctorOption = {
  id: string;
  fullName: string;
  specializationName: string;
};

export type RecallListItem = {
  id: string;
  patientId: string;
  patientName: string;
  patientNumber: string;
  patientPhone: string;
  doctorId: string | null;
  doctorName: string | null;
  type: RecallType;
  dueDate: string;
  status: RecallStatus;
  notes: string | null;
  taskId: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RecallFilters = {
  q?: string;
  status?: RecallStatus | "all" | "active";
  type?: RecallType | "all";
  doctor?: string;
  due?: "all" | "overdue" | "today" | "upcoming";
};

export type RecallSummary = {
  active: number;
  overdue: number;
  dueToday: number;
  tasksPending: number;
};
