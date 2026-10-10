import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addFollowup,
  completeFollowup,
  deleteItem,
  dismissFollowup,
  dismissItem,
  keepItem,
  reopenFollowup,
  saveTags,
  setFollowupDate,
} from "../../actions";
import { colourVar } from "@/components/Tags";
import { requireContext } from "@/lib/auth";
import { shortDate, todayIn } from "@/lib/dates";
import { dueLabel } from "@/lib/followups";
import { gmailWebLink } from "@/lib/gmail/api";
import { KIND_LABELS } from "@/lib/seed";

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { store } = await requireContext();
  const [item, subjects, areas, { timezone }, gmail] = await Promise.all([
    store.item(id),
    store.subjects(),
    store.areas(),
    store.appState(),
    store.gmailAccount(),
  ]);
  if (!item) notFound();
  const today = todayIn(timezone);
  const tagged = new Set([...item.subjects.map((s) => s.id), ...item.areas.map((a) => a.id)]);
  const kind = item.source === "gmail" ? "Gmail" : item.source === "photo" ? "Photo" : "Note";

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            {kind} · {item.happened_on ? shortDate(item.happened_on, today) : "No date"}
          </div>
          <h1 style={{ fontSize: 22 }}>{item.summary ?? item.email_subject ?? "Untitled"}</h1>
        </div>
      </div>

      {saved && <p className="notice">Saved.</p>}
      {item.status === "failed" && <p className="notice warn">The AI couldn&apos;t file this one. Add tags below.</p>}
      {item.status === "dismissed" && <p className="notice warn">You dismissed this email. Keep it to file it again.</p>}

      {(item.status === "review" || item.status === "dismissed") && (
        <div className="actions">
          <form action={keepItem}>
            <input type="hidden" name="id" value={item.id} />
            <button className="btn primary" type="submit">Keep</button>
          </form>
          {item.status === "review" && (
            <form action={dismissItem}>
              <input type="hidden" name="id" value={item.id} />
              <button className="btn" type="submit">Dismiss</button>
            </form>
          )}
        </div>
      )}

      {item.photo_path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/photo/${item.id}`} alt={item.summary ?? "Photo"} className="photo-full" />
      )}

      {item.source === "gmail" && (
        <div className="card">
          <div className="sub">{item.email_from}</div>
          <strong>{item.email_subject}</strong>
          {item.gmail_message_id && (
            <a href={gmailWebLink(item.gmail_message_id, gmail?.email)} target="_blank" rel="noreferrer" className="sub">
              Open in Gmail
            </a>
          )}
        </div>
      )}

      {item.original_text && (
        <div className="section">
          <span className="eyebrow">{item.source === "gmail" ? "Email text" : item.source === "photo" ? "Your caption" : "What you wrote"}</span>
          <p className="original">{item.original_text}</p>
        </div>
      )}

      <div className="section">
        <span className="eyebrow">Follow-ups</span>
        {item.followups.length === 0 && <p className="hint">None.</p>}
        {item.followups.map((f) => (
          <div key={f.id} className="card">
            <div className="task-top">
              <span className="task-title" style={{ textDecoration: f.status === "open" ? "none" : "line-through", color: f.status === "open" ? "var(--ink)" : "var(--muted)" }}>
                {f.title}
              </span>
              <span className="state">{f.status === "open" ? dueLabel(f.due_date, today) : f.status === "done" ? "Done" : "Dismissed"}</span>
            </div>
            <span className="hint">{f.direction === "waiting_on_them" ? "Waiting on them" : "On you"}</span>
            {f.status === "open" ? (
              <div className="actions">
                <form action={completeFollowup}>
                  <input type="hidden" name="id" value={f.id} />
                  <button className="btn small primary" type="submit">Done</button>
                </form>
                <form action={setFollowupDate} className="row" style={{ display: "flex", gap: 6 }}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="date" name="due_date" defaultValue={f.due_date ?? ""} aria-label="Due date" style={{ width: 160, padding: "5px 8px" }} />
                  <button className="btn small" type="submit">Set date</button>
                </form>
                <form action={dismissFollowup}>
                  <input type="hidden" name="id" value={f.id} />
                  <button className="btn small" type="submit">Not needed</button>
                </form>
              </div>
            ) : (
              <form action={reopenFollowup}>
                <input type="hidden" name="id" value={f.id} />
                <button className="btn small" type="submit">Reopen</button>
              </form>
            )}
          </div>
        ))}
        <details>
          <summary className="btn small">Add a follow-up</summary>
          <form action={addFollowup} className="card" style={{ marginTop: 8 }}>
            <input type="hidden" name="item_id" value={item.id} />
            <label className="field">
              What
              <input type="text" name="title" required placeholder="e.g. Call the vet" />
            </label>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <label className="field" style={{ flex: 1 }}>
                Who acts
                <select name="direction" defaultValue="on_me">
                  <option value="on_me">Me</option>
                  <option value="waiting_on_them">Them (I&apos;m waiting)</option>
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>
                By
                <input type="date" name="due_date" />
              </label>
            </div>
            <button className="btn primary" type="submit">Add</button>
          </form>
        </details>
      </div>

      <form action={saveTags} className="section">
        <input type="hidden" name="item_id" value={item.id} />
        <span className="eyebrow">Who</span>
        <div className="chips">
          {subjects.map((s) => (
            <label key={s.id} className="chip toggle">
              <input type="checkbox" name="subject" value={s.id} defaultChecked={tagged.has(s.id)} />
              <span className="dot" style={{ background: colourVar(s.colour) }} />
              {s.name}
            </label>
          ))}
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input type="text" name="new_subject" placeholder="Add someone or something new" aria-label="New who" />
          <select name="new_kind" defaultValue="person" aria-label="Kind" style={{ width: 120 }}>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <span className="eyebrow" style={{ marginTop: 8 }}>Area</span>
        <div className="chips">
          {areas.map((a) => (
            <label key={a.id} className="chip toggle">
              <input type="checkbox" name="area" value={a.id} defaultChecked={tagged.has(a.id)} />
              {a.name}
            </label>
          ))}
        </div>
        <input type="text" name="new_area" placeholder="Add a new area" aria-label="New area" />
        <label className="field" style={{ marginTop: 8 }}>
          Summary
          <input type="text" name="summary" defaultValue={item.summary ?? ""} />
        </label>
        <label className="field">
          Date it happened
          <input type="date" name="happened_on" defaultValue={item.happened_on ?? ""} />
        </label>
        <button className="btn primary block" type="submit">Save changes</button>
      </form>

      <details>
        <summary className="btn small danger">Delete this item</summary>
        <form action={deleteItem} className="card" style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={item.id} />
          <p>This removes the item, its photo and its follow-ups. It can&apos;t be undone.</p>
          <button className="btn danger" type="submit">Yes, delete</button>
        </form>
      </details>

      <p className="hint">
        <Link href="/">Back to Today</Link>
      </p>
    </>
  );
}
