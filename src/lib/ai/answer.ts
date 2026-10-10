import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { addDays, todayIn } from "../dates";
import type { Store } from "../store";
import type { ItemView } from "../types";
import { ANSWER_SYSTEM, PLAN_SYSTEM, PlanSchema, formatEntries, mergeCandidates, planContext, resolvePlan } from "./ask";
import { MODELS, anthropic, assertUnderCap, costOf, recordUsage } from "./client";

export interface Answer {
  text: string;
  sources: ItemView[];
  scope: string;
  cost: number;
}

export async function answerQuestion(store: Store, question: string): Promise<Answer> {
  await assertUnderCap(store);
  const [subjects, areas, { timezone }] = await Promise.all([store.subjects(), store.areas(), store.appState()]);
  const today = todayIn(timezone);
  const client = anthropic();
  let cost = 0;

  // 1. Turn the question into a filter (cheap model).
  const planRes = await client.messages.parse({
    model: MODELS.fast,
    max_tokens: 2000,
    system: PLAN_SYSTEM,
    messages: [{ role: "user", content: `${planContext(today, subjects, areas)}\n\nQUESTION: ${question}` }],
    output_config: { effort: "low", format: zodOutputFormat(PlanSchema) },
  });
  await recordUsage(store, MODELS.fast, "ask-plan", planRes.usage);
  cost += costOf(MODELS.fast, planRes.usage);
  const plan = planRes.parsed_output
    ? resolvePlan(planRes.parsed_output, subjects, areas, today)
    : { subjectIds: [], areaIds: [], from: addDays(today, -180), to: null, keywords: [] as string[] };

  // 2. Fetch matching records. Keyword search runs across everything, as a safety net for missed tags.
  const tagged =
    plan.subjectIds.length || plan.areaIds.length || plan.from
      ? await store.items({ subjectIds: plan.subjectIds, areaIds: plan.areaIds, from: plan.from, to: plan.to, limit: 60 })
      : [];
  const searched = plan.keywords.length
    ? await store.items({ text: plan.keywords.join(" or "), from: plan.from, to: plan.to, limit: 30 })
    : [];
  let sources = mergeCandidates(tagged, searched);
  if (!sources.length && !plan.subjectIds.length && !plan.areaIds.length && !plan.keywords.length) {
    sources = await store.items({ limit: 40 });
  }

  const scopeParts = [
    ...plan.subjectIds.map((id) => subjects.find((s) => s.id === id)?.name),
    ...plan.areaIds.map((id) => areas.find((a) => a.id === id)?.name),
  ].filter(Boolean);
  const scope = `${scopeParts.join(" · ") || "All records"}${plan.from ? ` · since ${plan.from}` : ""}`;

  if (!sources.length) {
    return { text: "Nothing in your records matches that question.", sources: [], scope, cost };
  }

  // 3. Write the answer from those records only (stronger model).
  const res = await client.beta.messages.create({
    model: MODELS.smart,
    max_tokens: 4000,
    system: ANSWER_SYSTEM,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: `TODAY: ${today}\n\nENTRIES\n${formatEntries(sources)}\n\nQUESTION: ${question}`,
      },
    ],
  });
  await recordUsage(store, MODELS.smart, "ask-answer", res.usage);
  cost += costOf(MODELS.smart, res.usage);
  if (res.stop_reason === "refusal") {
    return { text: "The AI declined to answer this one. Try rephrasing the question.", sources: [], scope, cost };
  }
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();
  return { text, sources, scope, cost };
}
