"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { colourVar } from "@/components/Tags";
import type { ItemView } from "@/lib/types";

const MAX_EDGE = 1600;

/** Shrinks a photo before upload: smaller and cheaper for the AI to read, and well under upload limits. */
async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

interface Result {
  item?: ItemView;
  error?: string;
  notice?: string;
}

export function CaptureForm() {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const small = await resize(file);
    setPhoto(small);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(small));
  }

  async function save() {
    if (!text.trim() && !photo) return;
    setBusy(true);
    setResult(null);
    const body = new FormData();
    body.set("text", text);
    if (photo) body.set("photo", photo, "photo.jpg");
    try {
      const res = await fetch("/api/capture", { method: "POST", body });
      const json = (await res.json()) as Result;
      if (!res.ok && !json.item) throw new Error(json.error ?? `Save failed (${res.status})`);
      setResult(json);
      setText("");
      setPhoto(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Save failed. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <textarea
        id="capture-text"
        className="capture"
        placeholder="What happened, or what do you need to remember?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        aria-label="Note"
      />
      <p className="hint">Tip: tap the mic on your keyboard to dictate. Add a photo of an invoice, a letter or a symptom.</p>

      {preview && (
        <div className="row" style={{ alignItems: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selected photo" className="thumb" style={{ width: 120, height: 90 }} />
          <button className="btn small" type="button" onClick={() => { setPhoto(null); setPreview(null); }}>
            Remove photo
          </button>
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr", gap: 8 }}>
        <button className="btn" type="button" onClick={() => cameraRef.current?.click()} disabled={busy}>
          Take photo
        </button>
        <button className="btn" type="button" onClick={() => uploadRef.current?.click()} disabled={busy}>
          Upload
        </button>
        <button className="btn primary" type="button" onClick={save} disabled={busy || (!text.trim() && !photo)}>
          {busy ? "Filing…" : "Save"}
        </button>
      </div>

      {result?.error && <p className="error" role="alert">{result.error}</p>}
      {result?.item && <Filed item={result.item} notice={result.notice} />}
    </div>
  );
}

function Filed({ item, notice }: { item: ItemView; notice?: string }) {
  const failed = item.status === "failed";
  return (
    <div className="card" style={{ background: failed ? "var(--today-soft)" : "var(--ok-soft)" }} aria-live="polite">
      <strong style={{ color: failed ? "var(--today)" : "var(--ok)", fontSize: 14 }}>
        {failed ? "Saved, but not filed" : "Saved and filed"}
      </strong>
      {failed && <p className="hint">{notice ?? "The AI couldn't read it. Your original is kept; add tags yourself."}</p>}
      {!failed && (
        <dl style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: "6px 10px", margin: 0, fontSize: 14 }}>
          <dt className="sub">Who</dt>
          <dd style={{ margin: 0 }} className="chips">
            {item.subjects.length ? item.subjects.map((s) => (
              <span key={s.id} className="chip"><span className="dot" style={{ background: colourVar(s.colour) }} />{s.name}</span>
            )) : <span className="sub">None</span>}
          </dd>
          <dt className="sub">Area</dt>
          <dd style={{ margin: 0 }} className="chips">
            {item.areas.length ? item.areas.map((a) => <span key={a.id} className="chip">{a.name}</span>) : <span className="sub">None</span>}
          </dd>
          <dt className="sub">Summary</dt>
          <dd style={{ margin: 0 }}>{item.summary}</dd>
          {item.followups.map((f) => (
            <FollowupLine key={f.id} title={f.title} due={f.due_date} waiting={f.direction === "waiting_on_them"} />
          ))}
        </dl>
      )}
      {item.needs_check && !failed && <p className="hint">Not sure about these tags. Have a quick look.</p>}
      <div className="actions">
        <Link className="btn small" href={`/items/${item.id}`}>{failed ? "Add tags" : "Edit"}</Link>
        <Link className="btn small" href="/">Back to Today</Link>
      </div>
    </div>
  );
}

function FollowupLine({ title, due, waiting }: { title: string; due: string | null; waiting: boolean }) {
  return (
    <>
      <dt className="sub">{waiting ? "Waiting on" : "Follow-up"}</dt>
      <dd style={{ margin: 0 }}>
        {title}
        {due && <strong> · {new Date(`${due}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</strong>}
      </dd>
    </>
  );
}
