import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/organizations/repository";
import { listPatients } from "@/modules/patients/repository";
import type { BranchOption } from "@/modules/patients/types";
import type {
  AppointmentFormOptions,
  CalendarAppointment,
  DoctorManagementDetail,
  DoctorOption,
  MemberOption,
} from "@/modules/scheduling/types";

const doctorRowSchema = z.object({
  id: z.uuid(),
  assignment_id: z.uuid(),
  full_name: z.string(),
  color: z.string(),
  specialization_name: z.string(),
  branch_id: z.uuid(),
  branch_name: z.string(),
  room_id: z.uuid().nullable(),
  room_name: z.string().nullable(),
  appointment_duration_minutes: z.number().int(),
});

const doctorManagementRowSchema = z.object({
  id: z.uuid(),
  employee_id: z.uuid(),
  full_name: z.string(),
  color: z.string(),
  specialization_name: z.string(),
  is_active: z.boolean(),
});

const workingHourSchema = z.object({
  weekday: z.coerce.number().int().min(1).max(7),
  startTime: z.string(),
  endTime: z.string(),
});

const doctorBranchRowSchema = z.object({
  assignment_id: z.uuid(),
  branch_id: z.uuid(),
  branch_name: z.string(),
  room_name: z.string().nullable(),
  appointment_duration_minutes: z.coerce.number().int().min(5).max(480),
  accepts_online_booking: z.boolean(),
  is_active: z.boolean(),
  working_hours: z.array(workingHourSchema),
  service_ids: z.array(z.uuid()),
});

const exceptionRowSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid(),
  branch_name: z.string(),
  exception_date: z.string(),
  type: z.enum(["day_off", "sick_leave", "vacation", "custom_hours", "blocked"]),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  reason: z.string().nullable(),
  is_active: z.boolean(),
});

const appointmentRowSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid(),
  branch_name: z.string(),
  patient_id: z.uuid(),
  patient_name: z.string(),
  patient_phone: z.string(),
  doctor_id: z.uuid(),
  doctor_name: z.string(),
  doctor_color: z.string(),
  room_name: z.string().nullable(),
  start_at: z.string(),
  end_at: z.string(),
  status_code: z.string(),
  status_name: z.string(),
  status_color: z.string(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
});

const branchRowSchema = z.object({ id: z.uuid(), name: z.string() });
const memberRowSchema = z.object({ user_id: z.uuid(), full_name: z.string().nullable() });

export async function listDoctors(allAccessibleBranches = false): Promise<DoctorOption[]> {
  const context = await requirePermission("appointments.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_doctor_options", {
    org_id: context.organization.id,
    target_branch_id: allAccessibleBranches ? null : context.activeBranchId,
  });

  if (error) throw new AppError("DOCTORS_LOAD_FAILED", "Не удалось загрузить врачей.");
  const parsed = z.array(doctorRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_DOCTOR_DATA", "Получены некорректные данные врачей.");

  return parsed.data.map((row) => ({
    id: row.id,
    assignmentId: row.assignment_id,
    fullName: row.full_name,
    color: row.color,
    specializationName: row.specialization_name,
    branchId: row.branch_id,
    branchName: row.branch_name,
    roomId: row.room_id,
    roomName: row.room_name,
    appointmentDurationMinutes: row.appointment_duration_minutes,
  }));
}

export async function listCalendarAppointments(
  dateFrom: string,
  dateTo: string,
): Promise<CalendarAppointment[]> {
  const context = await requirePermission("appointments.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_calendar_appointments", {
    org_id: context.organization.id,
    date_from: dateFrom,
    date_to: dateTo,
    target_branch_id: context.activeBranchId,
  });

  if (error) throw new AppError("APPOINTMENTS_LOAD_FAILED", "Не удалось загрузить календарь.");
  const parsed = z.array(appointmentRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_APPOINTMENT_DATA", "Получены некорректные данные записей.");

  return parsed.data.map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    doctorColor: row.doctor_color,
    roomName: row.room_name,
    startAt: row.start_at,
    endAt: row.end_at,
    statusCode: row.status_code,
    statusName: row.status_name,
    statusColor: row.status_color,
    reason: row.reason,
    notes: row.notes,
  }));
}

export async function getAppointmentFormOptions(): Promise<AppointmentFormOptions> {
  await requirePermission("appointments.manage");
  const [patients, doctors] = await Promise.all([listPatients(), listDoctors()]);
  return { patients, doctors };
}

export async function listSchedulingBranches(): Promise<BranchOption[]> {
  const context = await requirePermission("settings.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, name")
    .eq("organization_id", context.organization.id)
    .eq("is_active", true)
    .order("name");
  if (error) throw new AppError("BRANCHES_LOAD_FAILED", "Не удалось загрузить филиалы.");
  const parsed = z.array(branchRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_BRANCH_DATA", "Получены некорректные данные филиалов.");
  return parsed.data;
}

export async function listMemberOptions(): Promise<MemberOption[]> {
  const context = await requirePermission("users.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_member_options", {
    org_id: context.organization.id,
  });
  if (error) throw new AppError("MEMBERS_LOAD_FAILED", "Не удалось загрузить пользователей.");
  const parsed = z.array(memberRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_MEMBER_DATA", "Получены некорректные данные пользователей.");
  return parsed.data.map((row) => ({ userId: row.user_id, fullName: row.full_name }));
}

export async function getDoctorManagementDetail(
  doctorId: string,
): Promise<DoctorManagementDetail | null> {
  const context = await requirePermission("settings.manage");
  const supabase = await createClient();
  const [doctorResult, assignmentsResult, exceptionsResult, branchesResult, servicesResult] = await Promise.all([
    supabase.rpc("list_doctor_management", {
      org_id: context.organization.id,
      target_doctor_id: doctorId,
    }),
    supabase.rpc("list_doctor_branch_management", {
      org_id: context.organization.id,
      target_doctor_id: doctorId,
    }),
    supabase.rpc("list_doctor_schedule_exceptions_management", {
      org_id: context.organization.id,
      target_doctor_id: doctorId,
    }),
    supabase
      .from("branches")
      .select("id, name")
      .eq("organization_id", context.organization.id)
      .eq("is_active", true)
      .order("name"),
    supabase.rpc("list_services", { org_id: context.organization.id }),
  ]);

  if (doctorResult.error || assignmentsResult.error || exceptionsResult.error || branchesResult.error || servicesResult.error) {
    throw new AppError("DOCTOR_LOAD_FAILED", "Не удалось загрузить настройки врача.");
  }

  const doctors = z.array(doctorManagementRowSchema).safeParse(doctorResult.data ?? []);
  const assignments = z.array(doctorBranchRowSchema).safeParse(assignmentsResult.data ?? []);
  const exceptions = z.array(exceptionRowSchema).safeParse(exceptionsResult.data ?? []);
  const branches = z.array(branchRowSchema).safeParse(branchesResult.data ?? []);
  const services = z.array(z.object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    is_active: z.boolean(),
  }).passthrough()).safeParse(servicesResult.data ?? []);
  if (!doctors.success || !assignments.success || !exceptions.success || !branches.success || !services.success) {
    throw new AppError("INVALID_DOCTOR_DATA", "Получены некорректные настройки врача.");
  }

  const doctor = doctors.data[0];
  if (!doctor) return null;

  return {
    id: doctor.id,
    employeeId: doctor.employee_id,
    fullName: doctor.full_name,
    color: doctor.color,
    specializationName: doctor.specialization_name,
    isActive: doctor.is_active,
    assignments: assignments.data.map((assignment) => ({
      assignmentId: assignment.assignment_id,
      branchId: assignment.branch_id,
      branchName: assignment.branch_name,
      roomName: assignment.room_name,
      appointmentDurationMinutes: assignment.appointment_duration_minutes,
      acceptsOnlineBooking: assignment.accepts_online_booking,
      isActive: assignment.is_active,
      workingHours: assignment.working_hours.map((hours) => ({
        weekday: hours.weekday,
        startTime: hours.startTime.slice(0, 5),
        endTime: hours.endTime.slice(0, 5),
      })),
      serviceIds: assignment.service_ids,
    })),
    exceptions: exceptions.data.map((exception) => ({
      id: exception.id,
      branchId: exception.branch_id,
      branchName: exception.branch_name,
      date: exception.exception_date,
      type: exception.type,
      startTime: exception.start_time?.slice(0, 5) ?? null,
      endTime: exception.end_time?.slice(0, 5) ?? null,
      reason: exception.reason,
      isActive: exception.is_active,
    })),
    branches: branches.data,
    services: services.data
      .filter((service) => service.is_active)
      .map((service) => ({ id: service.id, code: service.code, name: service.name })),
  };
}
