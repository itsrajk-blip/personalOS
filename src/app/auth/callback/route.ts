import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/env";
import { userClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  if (!code) return to("/login?error=failed");

  const supabase = await userClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/login?error=failed");
  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    return to("/login?error=not_allowed");
  }
  return to("/");
}
