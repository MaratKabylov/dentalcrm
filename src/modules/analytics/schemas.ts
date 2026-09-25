import { z } from "zod";

const emptyToUndefined = (value: unknown) => typeof value === "string" && value.trim() === "" ? undefined : value;

export const analyticsFiltersSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  branch: z.preprocess(emptyToUndefined, z.uuid().optional()),
  doctor: z.preprocess(emptyToUndefined, z.uuid().optional()),
  specialization: z.preprocess(emptyToUndefined, z.uuid().optional()),
  source: z.preprocess(emptyToUndefined, z.uuid().optional()),
}).refine((value) => value.to >= value.from, { path: ["to"], message: "Конец периода не может быть раньше начала." })
  .refine((value) => (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <= 366, { path: ["to"], message: "Период не должен превышать 367 дней." });

export function defaultAnalyticsDates(today = new Date()) {
  const to = new Date(today);
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function parseAnalyticsFilters(input: Record<string, string | string[] | undefined>, today = new Date()) {
  const defaults = defaultAnalyticsDates(today);
  const parsed = analyticsFiltersSchema.safeParse({
    from: typeof input.from === "string" ? input.from : defaults.from,
    to: typeof input.to === "string" ? input.to : defaults.to,
    branch: typeof input.branch === "string" ? input.branch : undefined,
    doctor: typeof input.doctor === "string" ? input.doctor : undefined,
    specialization: typeof input.specialization === "string" ? input.specialization : undefined,
    source: typeof input.source === "string" ? input.source : undefined,
  });
  return parsed.success ? parsed.data : { ...defaults, branch: undefined, doctor: undefined, specialization: undefined, source: undefined };
}
