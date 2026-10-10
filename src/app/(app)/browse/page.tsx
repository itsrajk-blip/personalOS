import Link from "next/link";
import { resolveSuggestion } from "../actions";
import { colourVar } from "@/components/Tags";
import { requireContext } from "@/lib/auth";

export default async function BrowsePage() {
  const { store } = await requireContext();
  const [subjects, areas, counts, followups, suggestions] = await Promise.all([
    store.subjects(),
    store.areas(),
    store.itemCounts(),
    store.openFollowups(),
    store.pendingSuggestions(),
  ]);
  const openBySubject: Record<string, number> = {};
  for (const f of followups) {
    if (f.item.status === "review" || f.item.status === "dismissed") continue;
    for (const s of f.subjects) openBySubject[s.id] = (openBySubject[s.id] ?? 0) + 1;
  }

  return (
    <>
      <div className="page-head">
        <h1>Browse</h1>
        <Link href="/settings/lists" className="sub">Edit lists</Link>
      </div>

      <form action="/timeline" className="row" role="search">
        <input type="search" name="q" placeholder="Search everything" aria-label="Search everything" style={{ flex: 1 }} />
        <button className="btn" type="submit">Search</button>
      </form>

      <div className="section">
        <span className="eyebrow">Who</span>
        <div className="list">
          {subjects.map((s) => {
            const n = counts.bySubject[s.id] ?? 0;
            const open = openBySubject[s.id] ?? 0;
            return (
              <Link key={s.id} href={`/timeline?subject=${s.id}`}>
                <span className="row" style={{ gap: 10 }}>
                  <span className="dot" style={{ background: colourVar(s.colour), width: 10, height: 10 }} />
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                </span>
                <span className="v">
                  {n} item{n === 1 ? "" : "s"}
                  {open ? ` · ${open} open` : ""}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="section">
        <span className="eyebrow">By area</span>
        <div className="chips">
          {areas.map((a) => (
            <Link key={a.id} href={`/timeline?area=${a.id}`} className="chip link" style={{ padding: "6px 12px", fontSize: 13 }}>
              {a.name}
              <span className="sub" style={{ fontWeight: 400 }}>{counts.byArea[a.id] ?? 0}</span>
            </Link>
          ))}
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="section">
          <span className="eyebrow">Suggested</span>
          {suggestions.map((s) => (
            <div key={s.id} className="card">
              <p>
                Add <strong>{s.name}</strong> to your list? It came up in {s.mentions} entries.
              </p>
              <div className="actions">
                <form action={resolveSuggestion}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="decision" value="accept" />
                  <button className="btn small primary" type="submit">Add</button>
                </form>
                <form action={resolveSuggestion}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="decision" value="ignore" />
                  <button className="btn small" type="submit">Ignore</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
