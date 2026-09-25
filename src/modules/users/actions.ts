"use server";

import { createHash, randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUrl } from "@/lib/env";
import { getSafeErrorMessage } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/repository";
import { ACTIVE_ORGANIZATION_COOKIE, requirePermission } from "@/modules/organizations/repository";
import {
  createInvitationSchema,
  invitationIdSchema,
  invitationTokenSchema,
  updateMemberRoleSchema,
  updateMemberStatusSchema,
} from "@/modules/users/schemas";
import type { UserActionState } from "@/modules/users/types";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function errorState(error: unknown): UserActionState {
  const fallback = getSafeErrorMessage(error);
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    if (error.message.includes("already a member")) return { status: "error", message: "Пользователь с таким email уже состоит в клинике." };
    if (error.message.includes("Only an owner")) return { status: "error", message: "Только владелец может назначать другого владельца." };
    if (error.message.includes("keep at least one active owner")) return { status: "error", message: "В клинике должен остаться хотя бы один активный владелец." };
    if (error.message.includes("your own account")) return { status: "error", message: "Нельзя заблокировать или удалить собственную учётную запись." };
    if (error.message.includes("belongs to another email")) return { status: "error", message: "Приглашение создано для другого email." };
    if (error.message.includes("expired")) return { status: "error", message: "Срок действия приглашения истёк." };
    if (error.message.includes("unavailable")) return { status: "error", message: "Приглашение уже использовано или отменено." };
  }
  return { status: "error", message: fallback };
}

export async function createInvitation(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const context = await requirePermission("users.manage");
  const parsed = createInvitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте email и выбранную роль.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const token = randomBytes(32).toString("base64url");
    const supabase = await createClient();
    const { error } = await supabase.rpc("create_organization_invitation", {
      org_id: context.organization.id,
      invite_email: parsed.data.email,
      invite_role_id: parsed.data.roleId,
      invite_token_hash: tokenHash(token),
    });
    if (error) throw error;

    revalidatePath("/settings/users");
    return {
      status: "success",
      message: "Приглашение создано. Скопируйте ссылку и отправьте сотруднику.",
      invitationUrl: `${getAppUrl()}/invite/${token}`,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function revokeInvitation(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const context = await requirePermission("users.manage");
  const parsed = invitationIdSchema.safeParse(formData.get("invitationId"));
  if (!parsed.success) return { status: "error", message: "Приглашение не найдено." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("revoke_organization_invitation", {
      org_id: context.organization.id,
      target_invitation_id: parsed.data,
    });
    if (error) throw error;
    revalidatePath("/settings/users");
    return { status: "success", message: "Приглашение отменено." };
  } catch (error) {
    return errorState(error);
  }
}

export async function renewInvitation(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  return createInvitation(_state, formData);
}

export async function updateMemberRole(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const context = await requirePermission("users.manage");
  const parsed = updateMemberRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Не удалось определить пользователя или роль." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("change_organization_member_role", {
      org_id: context.organization.id,
      target_membership_id: parsed.data.membershipId,
      target_role_id: parsed.data.roleId,
    });
    if (error) throw error;
    revalidatePath("/settings/users");
    revalidatePath("/dashboard", "layout");
    return { status: "success", message: "Роль обновлена." };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateMemberStatus(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const context = await requirePermission("users.manage");
  const parsed = updateMemberStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Не удалось определить действие." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("change_organization_member_status", {
      org_id: context.organization.id,
      target_membership_id: parsed.data.membershipId,
      target_status: parsed.data.status,
    });
    if (error) throw error;
    revalidatePath("/settings/users");
    revalidatePath("/dashboard", "layout");
    return {
      status: "success",
      message: parsed.data.status === "active" ? "Доступ восстановлен." : parsed.data.status === "suspended" ? "Пользователь заблокирован." : "Пользователь удалён из клиники.",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function acceptInvitation(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  await requireUser();
  const parsed = invitationTokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) return { status: "error", message: "Ссылка приглашения повреждена." };

  let organizationId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accept_organization_invitation", {
      invite_token_hash: tokenHash(parsed.data),
    });
    if (error) throw error;
    organizationId = String(data);
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch (error) {
    return errorState(error);
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

