import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runTick } from "@/lib/jobs";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorised(req: Request): boolean {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env.cronSecret()}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Called every 15 minutes by the Supabase scheduler: Gmail sync and the 7am summary. */
async function handle(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const report = await runTick();
  return NextResponse.json({ ok: true, report });
}

export const GET = handle;
export const POST = handle;
