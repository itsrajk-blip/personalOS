// Answers a question from your records: plan a database filter, fetch matching items, then write the answer.
import { z } from "zod";
import { addDays, isIsoDate } from "../dates";
import type { Area, ItemView, Subject } from "../types";

export const PlanSchema = z.object({
  subjects: z.array(z.string()).describe("Exact names from WHO that the question is about. Empty if none."),
  areas: z.array(z.string()).describe("Exact names from AREAS. Empty if the question spans all areas."),
  from_date: z.string().nullable().describe("YYYY-MM-DD start of the period, or null."),
  to_date: z.string().nullable().describe("YYYY-MM-DD end of the period, or null."),
  keywords: z.array(z.string()).describe("1-4 distinctive words to search the original text for (e.g. 'headache', 'claim'). Empty if tags are enough."),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PLAN_SYSTEM = `You turn a question about a household record into a database filter. The record holds notes, photos and emails, each tagged with WHO it's about and an AREA.
- "Brief me for the vet" or anything about a pet's health: that pet + Health.
- "Brief me for my GP" or "my doctor": Me + Health.
- Default period for briefs: the last 6 months. For "when did I last..." questions: no period.
- Keep keywords for specific things the tags can't capture (a symptom, a company, a document).`;

export const ANSWER_SYSTEM = `You answer questions using only the owner's household records, which are listed as numbered entries. You are writing for the owner, who may hand a brief to a vet or doctor.

Rules
- Use only facts in the entries. If they don't answer the question, say so plainly in one sentence.
- Cite every fact with its entry number in square brackets, e.g. [3]. Several: [3][5].
- Dates matter: give the date for each event, in the form "6 Oct".
- Never diagnose, interpret symptoms or suggest treatment. Report what was recorded.
- For a brief: start with a one-line overview, then sections with "## " headings such as "## Since the last visit", "## Earlier", "## Open items". Use "- " bullets, newest first. Keep it to what fits on one phone screen where possible.
- For a simple question, answer in one to three sentences.
- Plain, direct Australian English. No preamble, no sign-off.`;

export function planContext(today: string, subjects: Subject[], areas: Area[]): string {
  return `TODAY: ${today}\n\nWHO\n${subjects.map((s) => `- ${s.name}`).join("\n")}\n\nAREAS\n${areas.map((a) => `- ${a.name}`).join("\n")}`;
}

export function resolvePlan(plan: Plan, subjects: Subject[], areas: Area[], today: string) {
  const match = <T extends { id: string; name: string }>(list: T[], names: string[]) =>
    names
      .map((n) => list.find((x) => x.name.toLowerCase() === n.trim().toLowerCase())?.id)
      .filter((id): id is string => !!id);
  const from = isIsoDate(plan.from_date) ? plan.from_date : null;
  const to = isIsoDate(plan.to_date) && plan.to_date <= addDays(today, 365) ? plan.to_date : null;
  return {
    subjectIds: match(subjects, plan.subjects),
    areaIds: match(areas, plan.areas),
    from,
    to,
    keywords: plan.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 4),
  };
}

/** Numbered entries for the answer prompt. Long originals are trimmed to keep the cost down. */
export function formatEntries(items: ItemView[]): string {
  return items
    .map((it, i) => {
      const tags = [...it.subjects.map((s) => s.name), ...it.areas.map((a) => a.name)].join(", ");
      const original = (it.original_text ?? "").replace(/\s+/g, " ").slice(0, 700);
      const open = it.followups
        .filter((f) => f.status === "open")
        .map((f) => `${f.title}${f.due_date ? ` (due ${f.due_date})` : ""}`)
        .join("; ");
      const lines = [
        `[${i + 1}] ${it.happened_on ?? it.created_at.slice(0, 10)} · ${it.source}${it.email_from ? ` from ${it.email_from}` : ""} · ${tags || "untagged"}`,
        `Summary: ${it.summary ?? "(none)"}`,
      ];
      if (original && original !== it.summary) lines.push(`Original: ${original}`);
      if (open) lines.push(`Open follow-ups: ${open}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/** Merges tag matches and keyword matches, newest first, capped. */
export function mergeCandidates(tagged: ItemView[], searched: ItemView[], cap = 60): ItemView[] {
  const seen = new Map<string, ItemView>();
  for (const it of [...tagged, ...searched]) if (!seen.has(it.id)) seen.set(it.id, it);
  return [...seen.values()]
    .sort((a, b) => (b.happened_on ?? b.created_at).localeCompare(a.happened_on ?? a.created_at))
    .slice(0, cap);
}
