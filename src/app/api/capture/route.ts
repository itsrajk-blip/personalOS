import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { filePhoto, fileText } from "@/lib/ai/file";
import { getContext } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { adminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { store, user } = ctx;

  const form = await req.formData();
  const text = String(form.get("text") ?? "").trim().slice(0, 10_000);
  const photo = form.get("photo");
  const today = todayIn((await store.appState()).timezone);

  if (photo instanceof File && photo.size > 0) {
    const type = (IMAGE_TYPES as readonly string[]).includes(photo.type) ? (photo.type as ImageType) : null;
    if (!type) return NextResponse.json({ error: "That file type isn't supported. Use a JPEG or PNG photo." }, { status: 400 });
    if (photo.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too large (4 MB limit)." }, { status: 400 });
    const bytes = Buffer.from(await photo.arrayBuffer());
    const path = `${user.id}/${randomUUID()}.${type.split("/")[1]}`;
    const up = await adminClient().storage.from("photos").upload(path, bytes, { contentType: type });
    if (up.error) return NextResponse.json({ error: `Couldn't store the photo: ${up.error.message}` }, { status: 500 });
    const item = await store.createItem({ source: "photo", original_text: text || null, photo_path: path, happened_on: today });
    const outcome = await filePhoto(store, item.id, { base64: bytes.toString("base64"), mediaType: type }, text || null);
    return NextResponse.json({ item: await store.item(item.id), notice: outcome.ok ? undefined : outcome.reason });
  }

  if (!text) return NextResponse.json({ error: "Write something or add a photo first." }, { status: 400 });
  const item = await store.createItem({ source: "text", original_text: text, happened_on: today });
  const outcome = await fileText(store, item.id, text);
  return NextResponse.json({ item: await store.item(item.id), notice: outcome.ok ? undefined : outcome.reason });
}
