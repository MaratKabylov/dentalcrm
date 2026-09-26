"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requireBranchPermission, requirePermission } from "@/modules/organizations/repository";
import { branchWorkingHoursSchema } from "@/modules/branches/schemas";
import {
  appointmentStatusChangeSchema,
  createAppointmentSchema,
  createDoctorSchema,
  doctorBranchAssignmentSchema,
  doctorBranchStatusSchema,
  doctorScheduleExceptionSchema,
  doctorScheduleExceptionStatusSchema,
} from "@/modules/scheduling/schemas";

function formError(message: string): FormActionState {
  return { status: "error", message };
}

export async function createDoctor(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("settings.manage");
  const parsed = createDoctorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте заполненные поля.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_doctor_with_schedule", {
    org_id: context.organization.id,
    doctor_branch_id: parsed.data.branchId,
    doctor_full_name: parsed.data.fullName,
    doctor_profile_id: parsed.data.profileId ?? null,
    doctor_specialization: parsed.data.specialization,
    doctor_room_name: parsed.data.roomName,
    doctor_color: parsed.data.color,
    duration_minutes: parsed.data.durationMinutes,
    workday_start: parsed.data.workdayStart,
    workday_end: parsed.data.workdayEnd,
  });

  if (error) return formError("Не удалось добавить врача и рабочий график.");
  revalidatePath("/settings/doctors");
  redirect("/settings/doctors?created=1");
}

export async function createAppointment(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("appointments.manage");
  const parsed = createAppointmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте параметры записи.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_appointment", {
    org_id: context.organization.id,
    appointment_branch_id: parsed.data.branchId,
    appointment_patient_id: parsed.data.patientId,
    appointment_doctor_id: parsed.data.doctorId,
    appointment_date: parsed.data.date,
    appointment_start_time: parsed.data.startTime,
    duration_minutes: parsed.data.durationMinutes,
    appointment_reason: parsed.data.reason || null,
    appointment_notes: parsed.data.notes || null,
  });

  if (error) {
    if (error.code === "23P01") return formError("Это время уже занято у врача или в кабинете.");
    if (error.message.includes("working hours")) return formError("Время находится вне рабочего графика врача.");
    if (error.message.includes("unavailable")) return formError("Врач недоступен в выбранное время.");
    return formError("Не удалось создать запись.");
  }

  revalidatePath("/calendar");
  redirect(`/calendar?date=${parsed.data.date}&view=day`);
}

export async function changeAppointmentStatus(formData: FormData) {
  const context = await requirePermission("appointments.manage");
  const parsed = appointmentStatusChangeSchema.parse({
    appointmentId: formData.get("appointmentId"),
    status: formData.get("status"),
  });
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_appointment_status", {
    org_id: context.organization.id,
    target_appointment_id: parsed.appointmentId,
    target_status_code: parsed.status,
  });
  if (error) throw new Error("Не удалось изменить статус записи.");
  revalidatePath("/calendar");
}

export async function saveDoctorBranchAssignment(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = doctorBranchAssignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте настройки врача в филиале.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const schedule = Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;
    const isWorking = formData.get(`working-${weekday}`) === "on";
    return {
      weekday,
      isWorking,
      startTime: isWorking ? String(formData.get(`start-${weekday}`) ?? "") : null,
      endTime: isWorking ? String(formData.get(`end-${weekday}`) ?? "") : null,
    };
  });
  const parsedSchedule = branchWorkingHoursSchema.safeParse(schedule);
  const serviceIds = formData.getAll("serviceId").map(String);
  if (!parsedSchedule.success || serviceIds.some((id) => !z.string().uuid().safeParse(id).success)) {
    return { status: "error", message: "Проверьте график и доступные услуги." };
  }
  const context = await requireBranchPermission("settings.manage", parsed.data.branchId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_doctor_branch_assignment", {
    org_id: context.organization.id,
    target_doctor_id: parsed.data.doctorId,
    target_branch_id: parsed.data.branchId,
    doctor_room_name: parsed.data.roomName,
    duration_minutes: parsed.data.durationMinutes,
    allow_online_booking: parsed.data.acceptsOnlineBooking,
    schedule: parsedSchedule.data,
    allowed_service_ids: serviceIds,
  });
  if (error) {
    if (error.message.includes("overlap another branch")) {
      return { status: "error", message: "График пересекается со сменой врача в другом филиале." };
    }
    return formError("Не удалось сохранить настройки врача в филиале.");
  }
  revalidatePath(`/settings/doctors/${parsed.data.doctorId}`);
  revalidatePath("/settings/doctors");
  revalidatePath("/calendar");
  return { status: "success", message: "Настройки филиала сохранены." };
}

export async function setDoctorBranchAssignmentActive(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = doctorBranchStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return formError("Назначение врача не найдено.");
  const context = await requireBranchPermission("settings.manage", parsed.data.branchId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_doctor_branch_assignment_active", {
    org_id: context.organization.id,
    target_doctor_id: parsed.data.doctorId,
    target_branch_id: parsed.data.branchId,
    target_is_active: parsed.data.isActive,
  });
  if (error) {
    if (error.message.includes("future appointments")) {
      return formError("Сначала перенесите или отмените будущие записи врача в этом филиале.");
    }
    return formError("Не удалось изменить статус назначения.");
  }
  revalidatePath(`/settings/doctors/${parsed.data.doctorId}`);
  revalidatePath("/settings/doctors");
  revalidatePath("/calendar");
  return { status: "success", message: parsed.data.isActive ? "Назначение восстановлено." : "Назначение архивировано." };
}

export async function saveDoctorScheduleException(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = doctorScheduleExceptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте исключение расписания.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const context = await requireBranchPermission("settings.manage", parsed.data.branchId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_doctor_schedule_exception", {
    org_id: context.organization.id,
    target_doctor_id: parsed.data.doctorId,
    target_branch_id: parsed.data.branchId,
    target_date: parsed.data.date,
    exception_type: parsed.data.type,
    exception_start_time: parsed.data.startTime,
    exception_end_time: parsed.data.endTime,
    exception_reason: parsed.data.reason || null,
  });
  if (error) return formError("Не удалось добавить исключение расписания.");
  revalidatePath(`/settings/doctors/${parsed.data.doctorId}`);
  revalidatePath("/calendar");
  return { status: "success", message: "Исключение добавлено." };
}

export async function setDoctorScheduleExceptionActive(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = doctorScheduleExceptionStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return formError("Исключение не найдено.");
  const context = await requirePermission("settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_doctor_schedule_exception_active", {
    org_id: context.organization.id,
    target_exception_id: parsed.data.exceptionId,
    target_is_active: parsed.data.isActive,
  });
  if (error) return formError("Не удалось изменить исключение.");
  revalidatePath(`/settings/doctors/${parsed.data.doctorId}`);
  revalidatePath("/calendar");
  return { status: "success", message: parsed.data.isActive ? "Исключение восстановлено." : "Исключение архивировано." };
}
