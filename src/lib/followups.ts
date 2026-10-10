// Rules for where a follow-up shows on the Today screen. Pure functions, so they're easy to test.
import { addDays, daysBetween } from "./dates";
import type { FollowupView } from "./types";

export type Bucket = "overdue" | "today" | "upcoming" | "anytime" | "waiting" | "later" | "snoozed" | "closed";

const UPCOMING_DAYS = 7;

export function bucketFor(
  f: Pick<FollowupView, "status" | "direction" | "due_date" | "snoozed_until">,
  today: string,
): Bucket {
  if (f.status !== "open") return "closed";
  if (f.snoozed_until && f.snoozed_until > today) return "snoozed";
  if (f.due_date && f.due_date < today) return "overdue";
  if (f.due_date === today) return "today";
  if (f.direction === "waiting_on_them") return "waiting";
  if (!f.due_date) return "anytime";
  if (f.due_date <= addDays(today, UPCOMING_DAYS)) return "upcoming";
  return "later";
}

export interface TodayBuckets {
  overdue: FollowupView[];
  today: FollowupView[];
  upcoming: FollowupView[];
  anytime: FollowupView[];
  waiting: FollowupView[];
  snoozedCount: number;
}

/** Groups open follow-ups for the Today screen. Follow-ups on Gmail items still awaiting review are left out. */
export function groupForToday(followups: FollowupView[], today: string): TodayBuckets {
  const out: TodayBuckets = { overdue: [], today: [], upcoming: [], anytime: [], waiting: [], snoozedCount: 0 };
  for (const f of followups) {
    if (f.item.status === "review" || f.item.status === "dismissed") continue;
    const b = bucketFor(f, today);
    if (b === "snoozed") out.snoozedCount++;
    else if (b === "overdue") out.overdue.push(f);
    else if (b === "today") out.today.push(f);
    else if (b === "upcoming") out.upcoming.push(f);
    else if (b === "anytime") out.anytime.push(f);
    else if (b === "waiting" || b === "later") {
      // "later" on-me items are not urgent; show them with waiting items only if they're promises from others.
      if (f.direction === "waiting_on_them") out.waiting.push(f);
    }
  }
  const byDue = (a: FollowupView, b: FollowupView) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  out.overdue.sort(byDue);
  out.upcoming.sort(byDue);
  out.waiting.sort(byDue);
  return out;
}

/** Short status label, e.g. "3 days late", "Today", "Thu 16 Oct". */
export function dueLabel(dueDate: string | null, today: string): string {
  if (!dueDate) return "No date";
  const diff = daysBetween(today, dueDate);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "1 day late";
  if (diff < 0) return `${-diff} days late`;
  if (diff < 7) return `In ${diff} days`;
  return new Date(`${dueDate}T00:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Snooze options shown on a follow-up. */
export function snoozeTargets(today: string): { label: string; date: string }[] {
  return [
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "3 days", date: addDays(today, 3) },
    { label: "Next week", date: addDays(today, 7) },
  ];
}
