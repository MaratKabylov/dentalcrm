import type { PatientListItem } from "@/modules/patients/types";

export type DoctorOption = {
  id: string;
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
