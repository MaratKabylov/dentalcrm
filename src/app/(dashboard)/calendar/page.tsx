import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { startClinicalEncounter } from "@/modules/clinical/actions";
import { getOrganizationContext } from "@/modules/organizations/repository";
import { changeAppointmentStatus } from "@/modules/scheduling/actions";
import {
  getCalendarRange,
  isoDateInTimeZone,
  normalizeCalendarDate,
  shiftCalendarDate,
} from "@/modules/scheduling/date-utils";
import { listCalendarAppointments, listDoctors } from "@/modules/scheduling/repository";
import type { CalendarAppointment, CalendarView } from "@/modules/scheduling/types";

const dateTitle = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayTitle = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function time(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(value));
}

function StatusActions({ appointment, canManage, canWriteClinical }: { appointment: CalendarAppointment; canManage: boolean; canWriteClinical: boolean }) {
  const actions: Record<string, Array<{ status: string; label: string }>> = {
    planned: [{ status: "confirmed", label: "Подтвердить" }, { status: "arrived", label: "Прибыл" }, { status: "cancelled", label: "Отменить" }],
    unconfirmed: [{ status: "confirmed", label: "Подтвердить" }, { status: "arrived", label: "Прибыл" }, { status: "cancelled", label: "Отменить" }],
    confirmed: [{ status: "arrived", label: "Прибыл" }, { status: "cancelled", label: "Отменить" }],
    arrived: [{ status: "cancelled", label: "Отменить" }],
  };
  const statusActions = canManage ? actions[appointment.statusCode] ?? [] : [];
  const showClinicalAction = canWriteClinical && ["arrived", "in_progress"].includes(appointment.statusCode);
  if (statusActions.length === 0 && !showClinicalAction) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {statusActions.map((action) => (
        <form action={changeAppointmentStatus} key={action.status}>
          <input type="hidden" name="appointmentId" value={appointment.id} />
          <input type="hidden" name="status" value={action.status} />
          <button className="rounded-lg border bg-white px-2.5 py-1 text-xs font-semibold hover:bg-[var(--surface-muted)]">{action.label}</button>
        </form>
      ))}
      {appointment.statusCode === "arrived" && canWriteClinical && (
        <form action={startClinicalEncounter}>
          <input type="hidden" name="appointmentId" value={appointment.id} />
          <button className="rounded-lg bg-[var(--brand)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--brand-dark)]">Начать приём</button>
        </form>
      )}
      {appointment.statusCode === "in_progress" && canWriteClinical && (
        <form action={startClinicalEncounter}>
          <input type="hidden" name="appointmentId" value={appointment.id} />
          <button className="rounded-lg bg-[var(--brand)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--brand-dark)]">Открыть приём</button>
        </form>
      )}
    </div>
  );
}

function AppointmentCard({ appointment, timeZone, canManage, canWriteClinical }: { appointment: CalendarAppointment; timeZone: string; canManage: boolean; canWriteClinical: boolean }) {
  return (
    <div className="rounded-xl border-l-4 bg-white p-4 shadow-sm" style={{ borderLeftColor: appointment.doctorColor }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><span className="text-sm font-bold">{time(appointment.startAt, timeZone)}–{time(appointment.endAt, timeZone)}</span><span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${appointment.statusColor}18`, color: appointment.statusColor }}>{appointment.statusName}</span></div>
          <Link href={`/patients/${appointment.patientId}`} className="mt-2 block font-semibold hover:text-[var(--brand)]">{appointment.patientName}</Link>
          <p className="mt-1 text-xs text-[var(--muted)]">{appointment.patientPhone}{appointment.reason ? ` · ${appointment.reason}` : ""}</p>
        </div>
        <div className="text-right text-xs text-[var(--muted)]"><p>{appointment.doctorName}</p><p className="mt-1">{appointment.roomName ?? appointment.branchName}</p></div>
      </div>
      <StatusActions appointment={appointment} canManage={canManage} canWriteClinical={canWriteClinical} />
    </div>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; doctor?: string }>;
}) {
  const query = await searchParams;
  const selectedDate = normalizeCalendarDate(query.date);
  const view: CalendarView = query.view === "week" ? "week" : "day";
  const range = getCalendarRange(selectedDate, view);
  const [appointments, doctors, context] = await Promise.all([
    listCalendarAppointments(range.from, range.to),
    listDoctors(),
    getOrganizationContext(),
  ]);
  if (!context) return null;

  const filtered = query.doctor ? appointments.filter((item) => item.doctorId === query.doctor) : appointments;
  const previous = shiftCalendarDate(selectedDate, view, -1);
  const next = shiftCalendarDate(selectedDate, view, 1);
  const title = view === "day"
    ? dateTitle.format(new Date(`${selectedDate}T00:00:00Z`))
    : `${dateTitle.format(new Date(`${range.from}T00:00:00Z`))} — ${dateTitle.format(new Date(`${range.to}T00:00:00Z`))}`;
  const groupKeys = view === "day"
    ? doctors.filter((doctor) => !query.doctor || doctor.id === query.doctor).map((doctor) => doctor.id)
    : Array.from({ length: 7 }, (_, index) => shiftCalendarDate(range.from, "day", index));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-sm font-semibold text-[var(--brand)]">Регистратура</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Календарь</h1><p className="mt-2 text-sm capitalize text-[var(--muted)]">{title}</p></div>
        <div className="flex flex-wrap gap-2">
          {context.can("appointments.manage") && <Link href={`/calendar/new?date=${selectedDate}`}><Button><Plus className="size-4" />Новая запись</Button></Link>}
          <Link href="/settings/doctors"><Button variant="secondary"><UserRound className="size-4" />Врачи</Button></Link>
        </div>
      </div>

      <Card className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
        <div className="flex items-center gap-1">
          <Link href={`/calendar?date=${previous}&view=${view}`}><Button variant="ghost" className="size-10 px-0" aria-label="Предыдущий период"><ChevronLeft className="size-4" /></Button></Link>
          <Link href={`/calendar?date=${normalizeCalendarDate(undefined)}&view=${view}`}><Button variant="secondary">Сегодня</Button></Link>
          <Link href={`/calendar?date=${next}&view=${view}`}><Button variant="ghost" className="size-10 px-0" aria-label="Следующий период"><ChevronRight className="size-4" /></Button></Link>
        </div>
        <form className="flex flex-1 flex-col gap-2 sm:flex-row" action="/calendar">
          <input type="hidden" name="date" value={selectedDate} />
          <input type="hidden" name="view" value={view} />
          <select name="doctor" defaultValue={query.doctor ?? ""} className="h-10 flex-1 rounded-xl border bg-white px-3 text-sm">
            <option value="">Все врачи</option>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName}</option>)}
          </select>
          <Button type="submit" variant="secondary">Применить</Button>
        </form>
        <div className="flex rounded-xl bg-[var(--surface-muted)] p-1">
          {(["day", "week"] as const).map((item) => <Link key={item} href={`/calendar?date=${selectedDate}&view=${item}`} className={view === item ? "rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow-sm" : "px-3 py-2 text-xs font-medium text-[var(--muted)]"}>{item === "day" ? "День" : "Неделя"}</Link>)}
        </div>
      </Card>

      {doctors.length === 0 ? (
        <Card className="grid min-h-80 place-items-center p-8 text-center"><div><CalendarDays className="mx-auto size-9 text-[var(--brand)]" /><h2 className="mt-4 font-semibold">Календарь нужно настроить</h2><p className="mt-1 text-sm text-[var(--muted)]">Добавьте первого врача, кабинет и рабочий график.</p><Link href="/settings/doctors/new"><Button className="mt-5">Добавить врача</Button></Link></div></Card>
      ) : (
        <div className={view === "day" ? "grid gap-4 lg:grid-cols-2 xl:grid-cols-3" : "grid gap-4 lg:grid-cols-2"}>
          {groupKeys.map((key) => {
            const doctor = view === "day" ? doctors.find((item) => item.id === key) : null;
            const items = filtered.filter((appointment) => view === "day" ? appointment.doctorId === key : isoDateInTimeZone(appointment.startAt, context.organization.timezone) === key);
            const heading = doctor?.fullName ?? dayTitle.format(new Date(`${key}T00:00:00Z`));
            return (
              <section key={key} className="min-w-0">
                <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold capitalize">{heading}</h2><p className="mt-0.5 text-xs text-[var(--muted)]">{doctor ? `${doctor.specializationName} · ${doctor.roomName ?? doctor.branchName}` : `${items.length} записей`}</p></div>{doctor && <span className="size-3 rounded-full" style={{ backgroundColor: doctor.color }} />}</div>
                <div className="space-y-3 rounded-2xl bg-[var(--surface-muted)] p-3">
                  {items.length === 0 ? <div className="grid min-h-28 place-items-center text-center text-sm text-[var(--muted)]"><span><Clock3 className="mx-auto mb-2 size-4" />Нет записей</span></div> : items.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} timeZone={context.organization.timezone} canManage={context.can("appointments.manage")} canWriteClinical={context.can("clinical.write")} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><MapPin className="size-4" />Время показано в часовом поясе {context.organization.timezone}.</div>
    </div>
  );
}
