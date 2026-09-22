import Link from "next/link";
import { Clock3, MapPin, Plus, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { listDoctors } from "@/modules/scheduling/repository";

export default async function DoctorsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ created }, doctors, context] = await Promise.all([
    searchParams,
    listDoctors(),
    getOrganizationContext(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Настройки</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Врачи и графики</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Врачи, кабинеты и стандартная длительность приёма.</p>
        </div>
        {context?.can("settings.manage") && <Link href="/settings/doctors/new"><Button><Plus className="size-4" />Добавить врача</Button></Link>}
      </div>

      {created === "1" && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Врач и рабочий график добавлены.</div>}

      {doctors.length === 0 ? (
        <Card className="grid min-h-72 place-items-center p-8 text-center">
          <div><Stethoscope className="mx-auto size-8 text-[var(--brand)]" /><h2 className="mt-4 font-semibold">Врачи ещё не добавлены</h2><p className="mt-1 text-sm text-[var(--muted)]">Добавьте врача, чтобы открыть запись в календаре.</p></div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {doctors.map((doctor) => (
            <Card key={doctor.id} className="p-5">
              <div className="flex items-start gap-4">
                <span className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: doctor.color }} />
                <div>
                  <h2 className="font-semibold">{doctor.fullName}</h2>
                  <p className="mt-1 text-sm text-[var(--brand)]">{doctor.specializationName}</p>
                  <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">
                    <p className="flex items-center gap-2"><MapPin className="size-4" />{doctor.branchName} · {doctor.roomName ?? "без кабинета"}</p>
                    <p className="flex items-center gap-2"><Clock3 className="size-4" />Пн–Пт, стандартный приём {doctor.appointmentDurationMinutes} мин.</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
