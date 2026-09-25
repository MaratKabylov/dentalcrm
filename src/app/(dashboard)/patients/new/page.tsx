import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { Card } from "@/components/ui/card";
import { getLead } from "@/modules/crm/repository";
import { CreatePatientForm } from "@/modules/patients/create-patient-form";
import { listPatientBranchOptions } from "@/modules/patients/repository";

export default async function NewPatientPage({ searchParams }: { searchParams: Promise<{ leadId?: string }> }) {
  const leadId = z.uuid().safeParse((await searchParams).leadId);
  const [branches, lead] = await Promise.all([
    listPatientBranchOptions(),
    leadId.success ? getLead(leadId.data) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/patients" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
          <ArrowLeft className="size-4" />К реестру
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Новый пациент</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Основные контактные и идентификационные данные.</p>
      </div>
      {lead && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Создаётся карточка для лида <span className="font-semibold">{lead.fullName}</span>. После сохранения лид автоматически станет пациентом.</div>}
      <Card className="p-5 sm:p-7">
        <CreatePatientForm branches={branches} lead={lead ? { id: lead.id, phone: lead.phone, email: lead.email, branchId: lead.branchId } : undefined} />
      </Card>
    </div>
  );
}
