import { NextResponse } from "next/server";
import { userClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await userClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url));
}
