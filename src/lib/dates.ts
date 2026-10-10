// Date helpers. All "day" values are ISO dates (YYYY-MM-DD) in the owner's time zone.

export const DEFAULT_TZ = "Australia/Melbourne";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date in the given time zone, e.g. "2026-10-10". */
export function todayIn(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Hour of day (0-23) in the given time zone. */
export function hourIn(tz: string = DEFAULT_TZ, now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(h);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function weekday(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" });
}

/** "10 Oct" or "10 Oct 2025" when not in the reference year. */
export function shortDate(isoDate: string, referenceIso?: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const sameYear = !referenceIso || referenceIso.slice(0, 4) === isoDate.slice(0, 4);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** Long heading form, e.g. "Saturday 10 October". */
export function longDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** ISO date for a timestamp, in the given zone. */
export function dateOf(timestamp: string | number | Date, tz: string = DEFAULT_TZ): string {
  return todayIn(tz, new Date(timestamp));
}
