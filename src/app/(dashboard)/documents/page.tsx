import Link from "next/link";
import { FileCheck2, Files, ShieldCheck, UsersRound } from "lucide-react";

import { Card } from "@/components/ui/card";
import { listDocumentTemplates } from "@/modules/documents/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function DocumentsPage() {
  const [templates, context] = await Promise.all([listDocumentTemplates(), getOrganizationContext()]);
  if (!context) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-[var(--brand)]">Фаза 5</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Документы и согласия</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Формируйте PDF из версионных шаблонов, фиксируйте подпись пациента и храните неизменяемую историю согласий.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><Files className="size-6 text-[var(--brand)]" /><p className="mt-4 text-3xl font-semibold">{templates.length}</p><p className="mt-1 text-sm text-[var(--muted)]">активных шаблонов</p></Card>
        <Card className="p-5"><FileCheck2 className="size-6 text-[var(--brand)]" /><p className="mt-4 font-semibold">Неизменяемые PDF</p><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Каждый выпуск сохраняет текст, версию шаблона и контрольную сумму.</p></Card>
        <Card className="p-5"><ShieldCheck className="size-6 text-[var(--brand)]" /><p className="mt-4 font-semibold">История согласий</p><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Действующие и отозванные согласия остаются в карточке пациента.</p></Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/patients" className="group rounded-2xl border bg-white p-6 transition hover:border-[var(--brand)]"><UsersRound className="size-7 text-[var(--brand)]" /><h2 className="mt-4 font-semibold">Открыть реестр пациентов</h2><p className="mt-1 text-sm text-[var(--muted)]">Документы создаются в карточке конкретного пациента.</p></Link>
        <Link href="/documents/templates" className="group rounded-2xl border bg-white p-6 transition hover:border-[var(--brand)]"><Files className="size-7 text-[var(--brand)]" /><h2 className="mt-4 font-semibold">Управление шаблонами</h2><p className="mt-1 text-sm text-[var(--muted)]">Настройте тип, текст, переменные и связь с реестром согласий.</p></Link>
      </div>
    </div>
  );
}
