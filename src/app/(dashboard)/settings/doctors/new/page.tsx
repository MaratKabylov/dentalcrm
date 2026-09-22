import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { CreateDoctorForm } from "@/modules/scheduling/create-doctor-form";
import { listMemberOptions, listSchedulingBranches } from "@/modules/scheduling/repository";

export default async function NewDoctorPage() {
  const [branches, members] = await Promise.all([
    listSchedulingBranches(),
    listMemberOptions(),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/settings/doctors" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К списку врачей</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Новый врач</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Одновременно создадим кабинет и базовый рабочий график.</p>
      </div>
      <Card className="p-5 sm:p-7"><CreateDoctorForm branches={branches} members={members} /></Card>
    </div>
  );
}
