import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import type { Store } from "../store";

export const MODELS = {
  fast: "claude-haiku-5-5",
  smart: "claude-sonnet-5-5",
} as const;

// US dollars per million tokens (input, output). Haiku's rate applies to prompts under 100K tokens, which ours always are.
const PRICES: Record<string, { input: number; output: number }> = {
  [MODELS.fast]: { input: 0.1, output: 0.5 },
  [MODELS.smart]: { input: 2, output: 10 },
};

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiUnavailableError("AI isn't set up yet: ANTHROPIC_API_KEY is missing");
  client ??= new Anthropic();
  return client;
}

export class AiUnavailableError extends Error {}

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costOf(model: string, u: Usage): number {
  const p = PRICES[model] ?? PRICES[MODELS.smart];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return (
    (u.input_tokens * p.input + cacheRead * p.input * 0.1 + cacheWrite * p.input * 1.25 + u.output_tokens * p.output) /
    1_000_000
  );
}

export async function recordUsage(store: Store, model: string, purpose: string, u: Usage): Promise<void> {
  try {
    await store.recordUsage({
      model,
      purpose,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      cost_usd: costOf(model, u),
    });
  } catch {
    // Spend tracking must never break capture.
  }
}

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Stops AI calls once this month's spend reaches the cap set in AI_MONTHLY_CAP_USD. */
export async function assertUnderCap(store: Store): Promise<void> {
  const { cost } = await store.spendSince(monthStartIso());
  if (cost >= env.monthlyCapUsd()) {
    throw new AiUnavailableError(`This month's AI limit of $${env.monthlyCapUsd()} is reached`);
  }
}
