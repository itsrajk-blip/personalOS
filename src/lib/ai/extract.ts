// Reads one note, photo or email and works out who it's about, the area, dates and follow-ups.
import { z } from "zod";
import { addDays, isIsoDate, weekday } from "../dates";
import type { FiledResult } from "../store";
import type { Area, Direction, Subject } from "../types";

export const ExtractionSchema = z.object({
  relevant: z
    .boolean()
    .describe("False only for emails with nothing worth keeping (marketing, newsletters, routine notifications). Always true for notes and photos."),
  summary: z.string().describe("One short line, under 90 characters, in plain words. No 'User' or 'The note says'."),
  happened_on: z.string().nullable().describe("YYYY-MM-DD the event happened or was observed, if known."),
  subjects: z.array(z.string()).describe("Names from the WHO list this is about. Use the exact names given."),
  areas: z.array(z.string()).describe("Names from the AREAS list. Use the exact names given."),
  followups: z
    .array(
      z.object({
        title: z.string().describe("Starts with a verb, under 70 characters. e.g. 'Chase insurer about Joey's claim'."),
        direction: z.enum(["on_me", "waiting_on_them"]),
        due_date: z.string().nullable().describe("YYYY-MM-DD, or null if there's genuinely no date."),
      }),
    )
    .describe("Only real actions or promises. Empty for plain observations."),
  new_subject: z
    .object({
      name: z.string(),
      kind: z.enum(["person", "pet", "home", "vehicle", "place", "other"]),
    })
    .nullable()
    .describe("A person, pet, vehicle or place this is mainly about that is NOT in the WHO list. Null otherwise."),
  confidence: z.enum(["high", "low"]).describe("Low if the content is unclear, unreadable, or you had to guess the tags."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export const EXTRACTION_SYSTEM = `You file entries for a private household record kept by one person (the owner, "Me"). Entries are short notes, dictated thoughts, photos, or emails. Your job is to tag each entry and pull out any follow-ups, so the owner can later find "everything about Joey's health" or see what's due today.

Tagging
- WHO: tag every listed person, pet or thing the entry is about. A note in first person with no other subject is about "Me". Owner's wife is Arpita. An entry can have several.
- AREAS: tag one or more. Pet health counts as Health. Bills, invoices, payments and refunds are "Finance and bills" (also add Insurance for insurance claims and premiums).
- Use only names from the lists. If the entry is mainly about someone or something missing from WHO (for example a second pet or a named relative), put it in new_subject.

Dates
- Work out real dates from relative phrases using TODAY. "Yesterday" is TODAY minus 1. "Next Friday" is the Friday of next week.
- happened_on: when the thing happened or was observed. For an email, when it was sent, unless it describes an earlier event.

Follow-ups
- on_me: something the owner has to do. "Pay invoice by 24 Oct", "book vet if still scratching by Friday".
- waiting_on_them: someone promised to reply or act. "We'll get back to you within 10 business days" becomes waiting_on_them with due_date set to the date the promise runs out (10 business days is 14 calendar days). If the owner sent an email asking a question or making a request with no promised timeframe, add waiting_on_them due 7 days after it was sent.
- Invoices and bills with a due date: on_me "Pay ..." with that date. Appointments: on_me with the appointment date, e.g. "HR-V service, 8am".
- Don't invent follow-ups for plain observations. "Had a headache today" has no follow-up.
- Don't repeat a follow-up already listed under EXISTING FOLLOW-UPS.

Health and photos
- Record symptoms factually. Never diagnose or suggest treatment.
- For a photo, describe what it shows in the summary (for a symptom: where, size, colour; for a document: who it's from, amount, due date).

Emails
- relevant is false for marketing, newsletters, social notifications, sign-in codes, and routine shipping updates with nothing to do.
- relevant is true for bills, appointments, insurance, health, the house, the car, job applications, and anything where someone promised a reply or asked the owner to act.`;

export interface ExtractionContext {
  today: string;
  subjects: Pick<Subject, "name" | "kind">[];
  areas: Pick<Area, "name">[];
  existingFollowups?: { title: string; due_date: string | null }[];
}

export function contextBlock(ctx: ExtractionContext): string {
  const who = ctx.subjects.map((s) => `- ${s.name} (${s.kind})`).join("\n");
  const areas = ctx.areas.map((a) => `- ${a.name}`).join("\n");
  const existing = ctx.existingFollowups?.length
    ? `\n\nEXISTING FOLLOW-UPS\n${ctx.existingFollowups.map((f) => `- ${f.title}${f.due_date ? ` (due ${f.due_date})` : ""}`).join("\n")}`
    : "";
  return `TODAY: ${ctx.today} (${weekday(ctx.today)})\n\nWHO\n${who}\n\nAREAS\n${areas}${existing}`;
}

/**
 * Turns the model's answer into database values: matches names to IDs (ignoring case),
 * drops invalid dates, and decides whether you should double-check the tags.
 */
export function resolveExtraction(
  x: Extraction,
  subjects: Subject[],
  areas: Area[],
  opts: { today: string; model: string; fromBackfill?: boolean; isEmail?: boolean },
): FiledResult & { newSubject: Extraction["new_subject"] } {
  const byName = <T extends { name: string; id: string; archived: boolean }>(list: T[], names: string[]) => {
    const ids = new Set<string>();
    for (const n of names) {
      const hit = list.find((s) => !s.archived && s.name.toLowerCase() === n.trim().toLowerCase());
      if (hit) ids.add(hit.id);
    }
    return [...ids];
  };
  const subjectIds = byName(subjects, x.subjects);
  const areaIds = byName(areas, x.areas);

  const happened = isIsoDate(x.happened_on) && x.happened_on <= addDays(opts.today, 1) ? x.happened_on : null;
  const staleBefore = addDays(opts.today, -30);

  const seen = new Set<string>();
  const followups = x.followups
    .filter((f) => f.title.trim())
    .filter((f) => {
      const key = f.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((f) => {
      const due = isIsoDate(f.due_date) ? f.due_date : null;
      // Old promises from the 90-day Gmail import shouldn't flood Today. They stay visible on the item.
      const stale = opts.fromBackfill && due !== null && due < staleBefore;
      return {
        title: f.title.trim().slice(0, 140),
        direction: f.direction as Direction,
        due_date: due,
        status: stale ? ("dismissed" as const) : ("open" as const),
      };
    });

  const newSubject =
    x.new_subject && !subjects.some((s) => s.name.toLowerCase() === x.new_subject!.name.trim().toLowerCase())
      ? x.new_subject
      : null;

  return {
    summary: x.summary.trim().slice(0, 200) || null,
    happened_on: happened,
    status: opts.isEmail ? (opts.fromBackfill ? "ready" : "review") : "ready",
    needs_check: x.confidence === "low" || subjectIds.length === 0 || areaIds.length === 0,
    ai_model: opts.model,
    subjectIds,
    areaIds,
    followups,
    newSubject,
  };
}
