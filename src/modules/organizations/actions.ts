"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSafeErrorMessage } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requireUser } from "@/modules/auth/repository";
import {
  ACTIVE_BRANCH_COOKIE,
  ACTIVE_ORGANIZATION_COOKIE,
  getOrganizationContext,
  listCurrentUserMemberships,
} from "@/modules/organizations/repository";
import {
  branchIdSchema,
  createOrganizationSchema,
  organizationIdSchema,
} from "@/modules/organizations/schemas";

const createdOrganizationSchema = z.uuid();

export async function createOrganization(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  await requireUser();
  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
    branchName: formData.get("branchName"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте заполненные поля.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_organization_with_owner", {
      organization_name: parsed.data.name,
      first_branch_name: parsed.data.branchName,
    });

    if (error) throw error;

    const organizationId = createdOrganizationSchema.parse(data);
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    cookieStore.delete(ACTIVE_BRANCH_COOKIE);
  } catch (error) {
    return { status: "error", message: getSafeErrorMessage(error) };
  }

  redirect("/dashboard");
}

export async function switchOrganization(formData: FormData) {
  const organizationId = organizationIdSchema.parse(
    formData.get("organizationId"),
  );
  const memberships = await listCurrentUserMemberships();

  if (!memberships.some((item) => item.organization.id === organizationId)) {
    throw new Error("Organization access denied");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  cookieStore.delete(ACTIVE_BRANCH_COOKIE);

  redirect("/dashboard");
}

export async function switchBranch(formData: FormData) {
  const branchId = branchIdSchema.parse(formData.get("branchId"));
  const context = await getOrganizationContext();
  const branch = context?.branches.find((item) => item.id === branchId && item.isActive);

  if (!context || !branch || !context.canAccessBranch(branchId)) {
    throw new Error("Branch access denied");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}
