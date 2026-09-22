import type { CalendarView } from "@/modules/scheduling/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function normalizeCalendarDate(value: string | undefined, fallback = new Date()) {
  if (!value || !ISO_DATE.test(value)) return toIsoDate(fallback);
  const parsed = toUtcDate(value);
  return Number.isNaN(parsed.getTime()) || toIsoDate(parsed) !== value
    ? toIsoDate(fallback)
    : value;
}

export function getCalendarRange(date: string, view: CalendarView) {
  const selected = toUtcDate(date);
  if (view === "day") return { from: date, to: date };

  const weekday = selected.getUTCDay() || 7;
  const monday = new Date(selected);
  monday.setUTCDate(selected.getUTCDate() - weekday + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: toIsoDate(monday), to: toIsoDate(sunday) };
}

export function shiftCalendarDate(date: string, view: CalendarView, direction: number) {
  const result = toUtcDate(date);
  result.setUTCDate(result.getUTCDate() + direction * (view === "week" ? 7 : 1));
  return toIsoDate(result);
}

export function isoDateInTimeZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
