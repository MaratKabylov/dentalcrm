import Link from "next/link";
import { BookOpenText, CalendarDays, ChevronRight, ClipboardPlus, Files, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listClinicalEncounters } from "@/modules/clinical/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export default async function ClinicalPage() {
  const [encounters, context] = await Promise.all([
    listClinicalEncounters(),
    getOrganizationContext(),
  ]);
  if (!context) return null;

  const openCount = encounters.filter((encounter) => encounter.status === "open").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Клиническая работа</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Врачебные приёмы</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Открытые приёмы и недавняя клиническая история.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/clinical/templates"><Button variant="secondary"><Files className="size-4" />Шаблоны</Button></Link>
          <Link href="/clinical/services"><Button variant="secondary"><BookOpenText className="size-4" />Каталог услуг</Button></Link>
          <Link href="/calendar"><Button variant="secondary"><CalendarDays className="size-4" />К календарю</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm text-[var(--muted)]">Открыто сейчас</p>
          <p className="mt-2 text-3xl font-semibold">{openCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-[var(--muted)]">Последние приёмы</p>
          <p className="mt-2 text-3xl font-semibold">{encounters.length}</p>
        </Card>
      </div>

      {encounters.length === 0 ? (
        <Card className="grid min-h-80 place-items-center p-8 text-center">
          <div>
            <ClipboardPlus className="mx-auto size-10 text-[var(--brand)]" />
            <h2 className="mt-4 text-lg font-semibold">Приёмов пока нет</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">Отметьте в календаре, что пациент прибыл, затем начните врачебный приём.</p>
            <Link href="/calendar"><Button className="mt-5">Открыть календарь</Button></Link>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b p-5"><h2 className="font-semibold">Журнал приёмов</h2></div>
          <div className="divide-y">
            {encounters.map((encounter) => (
              <Link key={encounter.id} href={`/clinical/encounters/${encounter.id}`} className="flex items-center gap-4 p-5 transition hover:bg-[var(--surface-muted)]">
                <div className={encounter.status === "open" ? "grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700" : "grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"}>
                  <Stethoscope className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{encounter.patientName}</p>
                    <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold">№ {encounter.patientExternalNumber}</span>
                    <span className={encounter.status === "open" ? "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800" : "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"}>{encounter.status === "open" ? "Открыт" : "Завершён"}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">{encounter.doctorName} · {encounter.branchName} · {formatDate(encounter.openedAt, context.organization.timezone)}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-[var(--muted)]" />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
