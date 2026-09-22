import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { CreatePatientForm } from "@/modules/patients/create-patient-form";
import { listPatientBranchOptions } from "@/modules/patients/repository";

export default async function NewPatientPage() {
  const branches = await listPatientBranchOptions();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/patients" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
          <ArrowLeft className="size-4" />К реестру
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Новый пациент</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Основные контактные и идентификационные данные.</p>
      </div>
      <Card className="p-5 sm:p-7">
        <CreatePatientForm branches={branches} />
      </Card>
    </div>
  );
}
