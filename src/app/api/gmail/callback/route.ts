import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminStore, getContext } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { Gmail, exchangeCode } from "@/lib/gmail/api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: Record<string, string>) => NextResponse.redirect(`${env.appUrl()}/settings?${new URLSearchParams(q)}`);

  const ctx = await getContext();
  if (!ctx) return NextResponse.redirect(`${env.appUrl()}/login`);

  const jar = await cookies();
  const expected = jar.get("gmail_oauth_state")?.value;
  jar.delete("gmail_oauth_state");
  if (!expected || url.searchParams.get("state") !== expected) return back({ gmail: "error", error: "the sign-in link expired" });
  if (url.searchParams.get("error")) return back({ gmail: "error", error: url.searchParams.get("error")! });

  const code = url.searchParams.get("code");
  if (!code) return back({ gmail: "error", error: "no code returned" });

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) return back({ gmail: "error", error: "Google didn't grant offline access" });
    if (!tokens.scope?.includes("gmail.readonly")) return back({ gmail: "error", error: "Gmail permission wasn't ticked" });
    const profile = await new Gmail(tokens.access_token!).profile();
    await adminStore(ctx.user.id).saveGmailAccount(profile.emailAddress, encrypt(tokens.refresh_token), profile.historyId);
    return back({ gmail: "connected" });
  } catch (err) {
    return back({ gmail: "error", error: err instanceof Error ? err.message.slice(0, 120) : "unknown error" });
  }
}
