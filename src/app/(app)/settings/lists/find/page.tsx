import Link from "next/link";
import { notFound } from "next/navigation";
import { tagPastItems } from "../../../actions";
import { requireContext } from "@/lib/auth";
import { shortDate, todayIn } from "@/lib/dates";

/** After adding someone new: find older entries that mention them, by keyword. No AI cost. */
export default async function FindPastPage({ searchParams }: { searchParams: Promise<{ subject?: string; q?: string }> }) {
  const sp = await searchParams;
  const { store } = await requireContext();
  const subjects = await store.subjects(true);
  const subject = subjects.find((s) => s.id === sp.subject);
  if (!subject) notFound();
  const today = todayIn((await store.appState()).timezone);
  const words = sp.q?.trim() || subject.name;
  const found = await store.items({ text: words, limit: 100, statuses: ["ready", "failed", "review"] });
  const candidates = found.filter((it) => !it.subjects.some((s) => s.id === subject.id));

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 22 }}>Past mentions of {subject.name}</h1>
      </div>
      <form className="row" style={{ flexWrap: "nowrap" }}>
        <input type="hidden" name="subject" value={subject.id} />
        <input type="search" name="q" defaultValue={words} aria-label="Search words" />
        <button className="btn" type="submit">Search</button>
      </form>
      <p className="hint">Try other words they&apos;re known by, e.g. a nickname or the clinic&apos;s name.</p>

      {candidates.length === 0 ? (
        <p className="empty">No untagged entries mention “{words}”.</p>
      ) : (
        <form action={tagPastItems} className="stack">
          <input type="hidden" name="subject" value={subject.id} />
          <div className="list">
            {candidates.map((it) => (
              <label key={it.id} style={{ justifyContent: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" name="item" value={it.id} defaultChecked style={{ width: 18, height: 18, flex: "none" }} />
                <span style={{ minWidth: 0, flex: 1 }}>{it.summary ?? it.original_text?.slice(0, 80)}</span>
                <span className="v">{it.happened_on ? shortDate(it.happened_on, today) : ""}</span>
              </label>
            ))}
          </div>
          <button className="btn primary block" type="submit">Tag selected with {subject.name}</button>
        </form>
      )}
      <Link href="/settings/lists" className="sub">Skip</Link>
    </>
  );
}
