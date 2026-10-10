import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { todayIn } from "../dates";
import type { Store } from "../store";
import { AiUnavailableError, MODELS, anthropic, assertUnderCap, recordUsage } from "./client";
import { EXTRACTION_SYSTEM, ExtractionSchema, contextBlock, resolveExtraction, type Extraction } from "./extract";

type Content = Anthropic.MessageParam["content"];

async function callExtraction(store: Store, model: string, content: Content, extraContext?: { title: string; due_date: string | null }[]) {
  const [subjects, areas, { timezone }] = await Promise.all([store.subjects(), store.areas(), store.appState()]);
  const today = todayIn(timezone);
  const ctx = contextBlock({ today, subjects, areas, existingFollowups: extraContext });
  const blocks: Anthropic.ContentBlockParam[] = [
    { type: "text", text: ctx },
    ...(typeof content === "string" ? [{ type: "text" as const, text: content }] : content),
  ];
  const res = await anthropic().messages.parse({
    model,
    max_tokens: 4000,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: blocks }],
    output_config: { effort: "low", format: zodOutputFormat(ExtractionSchema) },
  });
  await recordUsage(store, model, "extract", res.usage);
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`No usable answer (${res.stop_reason})`);
  return { extraction: res.parsed_output as Extraction, today };
}

async function save(
  store: Store,
  itemId: string,
  extraction: Extraction,
  today: string,
  model: string,
  opts: { fromBackfill?: boolean; isEmail?: boolean } = {},
) {
  const [subjects, areas] = await Promise.all([store.subjects(true), store.areas(true)]);
  const filed = resolveExtraction(extraction, subjects, areas, { today, model, ...opts });
  await store.fileItem(itemId, filed);
  if (filed.newSubject) await store.suggestSubject(filed.newSubject.name, filed.newSubject.kind);
  return filed;
}

export type FileOutcome = { ok: true } | { ok: false; reason: string };

function failure(err: unknown): FileOutcome {
  if (err instanceof AiUnavailableError) return { ok: false, reason: err.message };
  if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "The AI service is busy. Try again in a minute." };
  if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: "The Anthropic API key was rejected." };
  if (err instanceof Anthropic.APIError) return { ok: false, reason: `The AI service returned an error (${err.status}).` };
  return { ok: false, reason: err instanceof Error ? err.message : "Unknown error" };
}

/** Files a typed or dictated note. The original is already saved; on failure it's kept with status "failed". */
export async function fileText(store: Store, itemId: string, text: string): Promise<FileOutcome> {
  try {
    await assertUnderCap(store);
    const { extraction, today } = await callExtraction(store, MODELS.fast, `NOTE\n${text}`);
    await save(store, itemId, extraction, today, MODELS.fast);
    return { ok: true };
  } catch (err) {
    await store.markItemFailed(itemId);
    return failure(err);
  }
}

/** Files a photo. Tries the fast model first and retries on the stronger one if it isn't confident. */
export async function filePhoto(
  store: Store,
  itemId: string,
  image: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" },
  caption: string | null,
): Promise<FileOutcome> {
  const content: Anthropic.ContentBlockParam[] = [
    { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
    { type: "text", text: caption ? `PHOTO, with the owner's caption: ${caption}` : "PHOTO, no caption." },
  ];
  try {
    await assertUnderCap(store);
    let model: string = MODELS.fast;
    let { extraction, today } = await callExtraction(store, model, content);
    if (extraction.confidence === "low") {
      model = MODELS.smart;
      ({ extraction, today } = await callExtraction(store, model, content));
    }
    await save(store, itemId, extraction, today, model);
    return { ok: true };
  } catch (err) {
    await store.markItemFailed(itemId);
    return failure(err);
  }
}

/** Files an email. Returns relevant=false when it isn't worth keeping; the caller then deletes the item. */
export async function fileEmail(
  store: Store,
  itemId: string,
  email: { from: string; to: string; date: string; subject: string; body: string; sentByOwner: boolean; threadId: string },
  fromBackfill: boolean,
): Promise<{ relevant: boolean; dueSoon: string[] }> {
  await assertUnderCap(store);
  const existing = await store.openFollowupsForThread(email.threadId);
  const text = [
    `EMAIL ${email.sentByOwner ? "SENT BY THE OWNER" : "RECEIVED"}`,
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Date: ${email.date}`,
    `Subject: ${email.subject}`,
    "",
    email.body,
  ].join("\n");
  const { extraction, today } = await callExtraction(store, MODELS.fast, text, existing);
  if (!extraction.relevant) return { relevant: false, dueSoon: [] };
  const filed = await save(store, itemId, extraction, today, MODELS.fast, { fromBackfill, isEmail: true });
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 3);
  const soonIso = soon.toISOString().slice(0, 10);
  return {
    relevant: true,
    dueSoon: filed.followups.filter((f) => f.status === "open" && f.due_date && f.due_date <= soonIso).map((f) => f.title),
  };
}
