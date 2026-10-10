import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth";
import { authUrl } from "@/lib/gmail/api";

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state, ctx.user.email));
  res.cookies.set("gmail_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
