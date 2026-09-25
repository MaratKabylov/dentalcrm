import type { Metadata } from "next";

import { UserManagement } from "@/modules/users/user-management";
import { getUserManagementData } from "@/modules/users/repository";

export const metadata: Metadata = { title: "Пользователи" };

export default async function UsersSettingsPage() {
  const data = await getUserManagementData();
  return <UserManagement {...data} />;
}

