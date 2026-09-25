import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Введите корректный email")),
  password: z.string().min(8, "Пароль должен содержать не менее 8 символов"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registrationSchema = z.object({
  fullName: z.string().trim().min(2, "Укажите имя").max(120, "Имя слишком длинное"),
  email: z.string().trim().toLowerCase().pipe(z.email("Введите корректный email")),
  password: z.string().min(8, "Пароль должен содержать не менее 8 символов").max(72, "Пароль слишком длинный"),
  passwordConfirmation: z.string(),
}).refine((value) => value.password === value.passwordConfirmation, {
  path: ["passwordConfirmation"],
  message: "Пароли не совпадают",
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
