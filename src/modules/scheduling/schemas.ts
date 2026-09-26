import { z } from "zod";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите корректное время.");

export const createDoctorSchema = z.object({
  branchId: z.uuid("Выберите филиал."),
  profileId: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
  fullName: z.string().trim().min(2, "Укажите ФИО врача.").max(160),
  specialization: z.string().trim().min(2, "Укажите специализацию.").max(100),
  roomName: z.string().trim().min(1, "Укажите кабинет.").max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Выберите корректный цвет."),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  workdayStart: timeSchema,
  workdayEnd: timeSchema,
}).refine((value) => value.workdayEnd > value.workdayStart, {
  path: ["workdayEnd"],
  message: "Конец рабочего дня должен быть позже начала.",
});

export const createAppointmentSchema = z.object({
  branchId: z.uuid("Выберите филиал."),
  patientId: z.uuid("Выберите пациента."),
  doctorId: z.uuid("Выберите врача."),
  date: z.iso.date("Укажите корректную дату."),
  startTime: timeSchema,
  durationMinutes: z.coerce.number().int().min(5).max(480),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const appointmentStatusChangeSchema = z.object({
  appointmentId: z.uuid(),
  status: z.enum([
    "confirmed",
    "arrived",
    "in_progress",
    "completed",
    "cancelled",
    "no_show",
    "rescheduled",
  ]),
});

export const doctorBranchAssignmentSchema = z.object({
  doctorId: z.uuid(),
  branchId: z.uuid("Выберите филиал."),
  roomName: z.string().trim().min(1, "Укажите кабинет.").max(100),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  acceptsOnlineBooking: z.preprocess(
    (value) => value === "on" || value === "true",
    z.boolean(),
  ),
});

export const doctorBranchStatusSchema = z.object({
  doctorId: z.uuid(),
  branchId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const doctorScheduleExceptionSchema = z.object({
  doctorId: z.uuid(),
  branchId: z.uuid("Выберите филиал."),
  date: z.iso.date("Укажите дату."),
  type: z.enum(["day_off", "sick_leave", "vacation", "custom_hours", "blocked"]),
  startTime: z.preprocess((value) => value === "" ? null : value, timeSchema.nullable()),
  endTime: z.preprocess((value) => value === "" ? null : value, timeSchema.nullable()),
  reason: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.type !== "custom_hours") return;
  if (!value.startTime || !value.endTime || value.endTime <= value.startTime) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "Для особых часов укажите корректный интервал.",
    });
  }
});

export const doctorScheduleExceptionStatusSchema = z.object({
  doctorId: z.uuid(),
  exceptionId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});
