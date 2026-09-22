import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

export const createPatientSchema = z.object({
  lastName: z.string().trim().min(1, "Укажите фамилию.").max(100),
  firstName: z.string().trim().min(1, "Укажите имя.").max(100),
  middleName: optionalText(100),
  birthDate: z.preprocess(
    emptyToUndefined,
    z.iso.date("Укажите корректную дату.").refine(
      (value) => new Date(`${value}T00:00:00Z`) <= new Date(),
      "Дата рождения не может быть в будущем.",
    ).optional(),
  ),
  gender: z.preprocess(emptyToUndefined, z.enum(["male", "female"]).optional()),
  phone: z.string().trim().refine(
    (value) => value.replace(/\D/g, "").length >= 5,
    "Укажите корректный телефон.",
  ).refine(
    (value) => value.replace(/\D/g, "").length <= 15,
    "В телефоне слишком много цифр.",
  ),
  iin: z.preprocess(
    emptyToUndefined,
    z.string().trim().regex(/^\d{12}$/, "ИИН должен содержать 12 цифр.").optional(),
  ),
  email: z.preprocess(
    emptyToUndefined,
    z.email("Укажите корректный email.").max(254).optional(),
  ),
  primaryBranchId: z.preprocess(emptyToUndefined, z.uuid().optional()),
  consentPersonalData: z.boolean(),
  consentMarketing: z.boolean(),
});

export const patientIdSchema = z.uuid();
