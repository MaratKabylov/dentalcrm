import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Введите корректный email").trim().toLowerCase(),
  password: z.string().min(8, "Пароль должен содержать не менее 8 символов"),
});

export type LoginInput = z.infer<typeof loginSchema>;
