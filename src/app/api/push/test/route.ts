import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth";
import { sendPush } from "@/lib/push";

export async function POST() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const sent = await sendPush(ctx.store, { title: "PersonalOS", body: "Notifications are working.", url: "/settings", tag: "test" });
  if (!sent) return NextResponse.json({ error: "No device received it. Turn notifications off and on again." }, { status: 400 });
  return NextResponse.json({ sent });
}
