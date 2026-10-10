import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";

/** Redirects to a short-lived link for an item's photo, after checking the item is yours. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const item = await ctx.store.item(id);
  if (!item?.photo_path) return NextResponse.json({ error: "No photo." }, { status: 404 });
  const { data, error } = await adminClient().storage.from("photos").createSignedUrl(item.photo_path, 600);
  if (error || !data) return NextResponse.json({ error: "Couldn't load the photo." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, max-age=300" } });
}
