"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requirePermission } from "@/modules/organizations/repository";
import {
  appointmentStatusChangeSchema,
  createAppointmentSchema,
  createDoctorSchema,
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
