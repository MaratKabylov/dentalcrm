import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { normalizeCalendarDate } from "@/modules/scheduling/date-utils";
import { CreateAppointmentForm } from "@/modules/scheduling/create-appointment-form";
import { getAppointmentFormOptions } from "@/modules/scheduling/repository";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; patient?: string }>;
}) {
  const [{ date, patient }, options] = await Promise.all([searchParams, getAppointmentFormOptions()]);
  const defaultDate = normalizeCalendarDate(date);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/calendar?date=${defaultDate}&view=day`} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-4" />К календарю</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Новая запись</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Выберите пациента, врача и свободное время.</p>
      </div>
      {options.doctors.length === 0 ? (
        <Card className="p-6 text-sm">Сначала <Link href="/settings/doctors/new" className="font-semibold text-[var(--brand)]">добавьте врача и график</Link>.</Card>
      ) : options.patients.length === 0 ? (
        <Card className="p-6 text-sm">Сначала <Link href="/patients/new" className="font-semibold text-[var(--brand)]">создайте пациента</Link>.</Card>
      ) : (
        <Card className="p-5 sm:p-7"><CreateAppointmentForm options={options} defaultDate={defaultDate} defaultPatientId={patient} /></Card>
      )}
    </div>
  );
}
