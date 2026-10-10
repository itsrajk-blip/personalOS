import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/ai/answer";
import { AiUnavailableError } from "@/lib/ai/client";
import { getContext } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { question } = (await req.json().catch(() => ({}))) as { question?: string };
  const q = (question ?? "").trim().slice(0, 500);
  if (!q) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  try {
    const a = await answerQuestion(ctx.store, q);
    return NextResponse.json({
      text: a.text,
      scope: a.scope,
      cost: a.cost,
      sources: a.sources.map((s) => ({
        id: s.id,
        source: s.source,
        summary: s.summary,
        happened_on: s.happened_on,
        has_photo: !!s.photo_path,
      })),
    });
  } catch (err) {
    const message =
      err instanceof AiUnavailableError
        ? err.message
        : err instanceof Anthropic.RateLimitError
          ? "The AI service is busy. Try again in a minute."
          : err instanceof Anthropic.APIError
            ? `The AI service returned an error (${err.status}).`
            : "Something went wrong answering that.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
