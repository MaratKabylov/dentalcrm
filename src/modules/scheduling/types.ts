import type { PatientListItem } from "@/modules/patients/types";

export type DoctorOption = {
  id: string;
  assignmentId: string;
  fullName: string;
  color: string;
  specializationName: string;
  branchId: string;
  branchName: string;
  roomId: string | null;
  roomName: string | null;
  appointmentDurationMinutes: number;
};

export type CalendarAppointment = {
  id: string;
  branchId: string;
  branchName: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  doctorName: string;
  doctorColor: string;
  roomName: string | null;
  startAt: string;
  endAt: string;
  statusCode: string;
  statusName: string;
  statusColor: string;
  reason: string | null;
  notes: string | null;
};

export type AppointmentFormOptions = {
  patients: PatientListItem[];
  doctors: DoctorOption[];
};

export type CalendarView = "day" | "week";

export type MemberOption = {
  userId: string;
  fullName: string | null;
};

export type DoctorWorkingHour = {
  weekday: number;
  startTime: string;
  endTime: string;
};

export type DoctorBranchAssignment = {
  assignmentId: string;
  branchId: string;
  branchName: string;
  roomName: string | null;
  appointmentDurationMinutes: number;
  acceptsOnlineBooking: boolean;
  isActive: boolean;
  workingHours: DoctorWorkingHour[];
  serviceIds: string[];
};

export type DoctorScheduleException = {
  id: string;
  branchId: string;
  branchName: string;
  date: string;
  type: "day_off" | "sick_leave" | "vacation" | "custom_hours" | "blocked";
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  isActive: boolean;
};

export type DoctorManagementDetail = {
  id: string;
  employeeId: string;
  fullName: string;
  color: string;
  specializationName: string;
  isActive: boolean;
  assignments: DoctorBranchAssignment[];
  exceptions: DoctorScheduleException[];
  branches: Array<{ id: string; name: string }>;
  services: Array<{ id: string; code: string; name: string }>;
};
