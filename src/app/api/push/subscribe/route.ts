import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth";

export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const sub = (await req.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys.auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }
  await ctx.store.savePushSubscription(sub.endpoint, sub.keys.p256dh, sub.keys.auth);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await ctx.store.deletePushSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
