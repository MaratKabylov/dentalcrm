"use server";

import { redirect } from "next/navigation";

import { getAppUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, registrationSchema } from "@/modules/auth/schemas";
import type { FormActionState } from "@/modules/auth/types";

export async function login(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте заполненные поля.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      status: "error",
      message: "Неверный email или пароль.",
    };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function register(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = registrationSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте заполненные поля.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    return {
      status: "error",
      message: message.includes("rate limit")
        ? "Слишком много попыток. Попробуйте зарегистрироваться немного позже."
        : message.includes("already registered")
          ? "Пользователь с таким email уже зарегистрирован."
          : "Не удалось создать аккаунт. Попробуйте ещё раз.",
    };
  }

  if (data.session) redirect("/onboarding");

  return {
    status: "success",
    message: "Проверьте почту — мы отправили ссылку для подтверждения регистрации.",
  };
}
