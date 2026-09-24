import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { CommunicationComposeForm } from "@/modules/communications/communication-compose-form";
import { listCommunicationTargets, listCommunicationTemplates } from "@/modules/communications/repository";
import { communicationDefaultsSchema } from "@/modules/communications/schemas";
import { requirePermission } from "@/modules/organizations/repository";

export default async function NewCommunicationPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; leadId?: string }>;
}) {
  const context = await requirePermission("communications.manage");
  const query = await searchParams;
  const parsedDefaults = communicationDefaultsSchema.safeParse(query);
  const requested = parsedDefaults.success ? parsedDefaults.data : { type: undefined, id: undefined };
  const [targets, templates] = await Promise.all([
    listCommunicationTargets(),
    listCommunicationTemplates(),
  ]);
  const hasRequestedTarget = targets.some(
    (target) => target.type === requested.type && target.id === requested.id,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><Link href="/crm/communications" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К журналу коммуникаций</Link><h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Новое сообщение</h1><p className="mt-2 text-sm text-[var(--muted)]">Подготовьте сообщение для отправки через подключаемого провайдера.</p></div>
      <Card className="p-5 lg:p-7">
        <CommunicationComposeForm
          targets={targets}
          templates={templates}
          organizationName={context.organization.name}
          defaultTargetType={hasRequestedTarget ? requested.type : undefined}
          defaultTargetId={hasRequestedTarget ? requested.id : undefined}
        />
      </Card>
    </div>
  );
}
