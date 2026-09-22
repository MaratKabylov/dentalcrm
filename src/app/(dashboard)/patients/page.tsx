import Link from "next/link";
import { CalendarPlus, ChevronRight, Plus, Search, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { listPatients } from "@/modules/patients/repository";

function fullName(patient: Awaited<ReturnType<typeof listPatients>>[number]) {
  return [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ");
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [patients, context] = await Promise.all([
    listPatients(q),
    getOrganizationContext(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Регистратура</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Пациенты</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Поиск и ведение единого реестра пациентов клиники.</p>
        </div>
        {context?.can("patients.create") && (
          <Link href="/patients/new">
            <Button><Plus className="size-4" />Новый пациент</Button>
          </Link>
        )}
      </div>

      <Card className="p-4">
        <form className="flex flex-col gap-3 sm:flex-row" action="/patients">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" />
            <Input
              name="q"
              defaultValue={q}
              className="pl-10"
              placeholder="Фамилия, телефон, ИИН или номер пациента"
              aria-label="Поиск пациентов"
            />
          </div>
          <Button type="submit" variant="secondary">Найти</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Реестр пациентов</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {q ? `Найдено по запросу: ${patients.length}` : `Показано: ${patients.length}`}
            </p>
          </div>
        </div>

        {patients.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                <UsersRound className="size-6" />
              </div>
              <h3 className="mt-4 font-semibold">{q ? "Пациенты не найдены" : "Реестр пока пуст"}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {q ? "Проверьте запрос или попробуйте искать по части имени." : "Создайте первую карточку пациента."}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {patients.map((patient) => (
              <Link
                key={patient.id}
                href={`/patients/${patient.id}`}
                className="grid gap-3 px-5 py-4 transition hover:bg-[var(--surface-muted)] sm:grid-cols-[1fr_180px_150px_20px] sm:items-center"
              >
                <div>
                  <p className="font-medium">{fullName(patient)}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">№ {patient.externalNumber}{patient.iin ? ` · ИИН ${patient.iin}` : ""}</p>
                </div>
                <p className="text-sm">{patient.phone}</p>
                <p className="text-sm text-[var(--muted)]">{patient.birthDate ?? "Дата не указана"}</p>
                <ChevronRight className="hidden size-4 text-[var(--muted)] sm:block" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <CalendarPlus className="size-4" />
        Карточки пациентов связаны с календарём записей.
      </div>
    </div>
  );
}
