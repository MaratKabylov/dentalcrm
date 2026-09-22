import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/auth/repository";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
