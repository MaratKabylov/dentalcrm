import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, CircleUserRound, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { patientIdSchema } from "@/modules/patients/schemas";
import { getPatient } from "@/modules/patients/repository";

function calculateAge(birthDate: string | null) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = patientIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [patient, context] = await Promise.all([
    getPatient(parsedId.data),
    getOrganizationContext(),
  ]);
  if (!patient) notFound();

  const name = [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ");
  const age = calculateAge(patient.birthDate);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/patients" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft className="size-4" />К реестру
      </Link>

      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="flex items-start gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <CircleUserRound className="size-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-[-0.04em]">{name}</h1>
              <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold">№ {patient.externalNumber}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {patient.birthDate ?? "Дата рождения не указана"}{age !== null ? ` · ${age} лет` : ""}{patient.iin ? ` · ИИН ${patient.iin}` : ""}
            </p>
          </div>
        </div>
        {context?.can("appointments.manage") && <Link href={`/calendar/new?patient=${patient.id}`}><Button><CalendarPlus className="size-4" />Новая запись</Button></Link>}
      </div>

      <div className="flex gap-2 overflow-x-auto border-b">
        <span className="border-b-2 border-[var(--brand)] px-3 py-3 text-sm font-semibold text-[var(--brand-dark)]">Обзор</span>
        {context?.can("clinical.read") && <Link href={`/patients/${patient.id}/odontogram`} className="whitespace-nowrap px-3 py-3 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">Одонтограмма</Link>}
        {context?.can("clinical.read") && <Link href={`/patients/${patient.id}/treatment`} className="whitespace-nowrap px-3 py-3 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">Планы лечения</Link>}
        {['Записи', 'История', 'Документы', 'Оплаты', 'Активность'].map((tab) => (
          <span key={tab} className="whitespace-nowrap px-3 py-3 text-sm text-[var(--muted)]">{tab}</span>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_0.65fr]">
        <Card className="p-5">
          <h2 className="font-semibold">Контактные данные</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3"><Phone className="mt-0.5 size-4 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Телефон</p><p className="mt-1 text-sm font-medium">{patient.phone}</p></div></div>
            <div className="flex gap-3"><Mail className="mt-0.5 size-4 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Email</p><p className="mt-1 text-sm font-medium">{patient.email ?? "Не указан"}</p></div></div>
            <div className="flex gap-3"><MapPin className="mt-0.5 size-4 text-[var(--brand)]" /><div><p className="text-xs text-[var(--muted)]">Основной филиал</p><p className="mt-1 text-sm font-medium">{patient.primaryBranch?.name ?? "Не выбран"}</p></div></div>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Согласия</h2>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center gap-3"><ShieldCheck className={patient.consentPersonalData ? "size-4 text-[var(--brand)]" : "size-4 text-[var(--muted)]"} /><span>Персональные данные: {patient.consentPersonalData ? "получено" : "не отмечено"}</span></div>
            <div className="flex items-center gap-3"><ShieldCheck className={patient.consentMarketing ? "size-4 text-[var(--brand)]" : "size-4 text-[var(--muted)]"} /><span>Маркетинг: {patient.consentMarketing ? "получено" : "не отмечено"}</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
