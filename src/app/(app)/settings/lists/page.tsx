import Link from "next/link";
import {
  addArea,
  addSubject,
  archiveArea,
  archiveSubject,
  mergeArea,
  mergeSubject,
  updateArea,
  updateSubject,
} from "../../actions";
import { colourVar } from "@/components/Tags";
import { requireContext } from "@/lib/auth";
import { COLOURS, KIND_LABELS } from "@/lib/seed";

export default async function ListsPage() {
  const { store } = await requireContext();
  const [subjects, areas] = await Promise.all([store.subjects(true), store.areas(true)]);
  const active = subjects.filter((s) => !s.archived);
  const activeAreas = areas.filter((a) => !a.archived);

  return (
    <>
      <div className="page-head">
        <h1>Lists</h1>
        <Link href="/settings" className="sub">Settings</Link>
      </div>

      <section className="section" id="who">
        <span className="eyebrow">Who it&apos;s about</span>
        {subjects.map((s) => (
          <details key={s.id} className="card" style={{ opacity: s.archived ? 0.6 : 1 }}>
            <summary className="row" style={{ cursor: "pointer", listStyle: "none" }}>
              <span className="dot" style={{ background: colourVar(s.colour), width: 10, height: 10 }} />
              <strong>{s.name}</strong>
              <span className="sub">{KIND_LABELS[s.kind]}{s.archived ? " · archived" : ""}</span>
              <span className="spacer" />
              <span className="sub">Edit</span>
            </summary>
            <form action={updateSubject} className="stack" style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={s.id} />
              <label className="field">Name<input type="text" name="name" defaultValue={s.name} /></label>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <label className="field" style={{ flex: 1 }}>
                  Kind
                  <select name="kind" defaultValue={s.kind}>
                    {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
                <label className="field" style={{ flex: 1 }}>
                  Colour
                  <select name="colour" defaultValue={s.colour}>
                    {COLOURS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <button className="btn small primary" type="submit">Save</button>
            </form>
            <div className="actions" style={{ marginTop: 8 }}>
              <form action={archiveSubject}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="archived" value={s.archived ? "false" : "true"} />
                <button className="btn small" type="submit">{s.archived ? "Restore" : "Archive"}</button>
              </form>
              {!s.archived && (
                <Link className="btn small" href={`/settings/lists/find?subject=${s.id}`}>Find past mentions</Link>
              )}
            </div>
            {!s.archived && active.length > 1 && (
              <form action={mergeSubject} className="row" style={{ marginTop: 8, flexWrap: "nowrap" }}>
                <input type="hidden" name="id" value={s.id} />
                <select name="into" defaultValue="" aria-label="Merge into">
                  <option value="" disabled>Merge into…</option>
                  {active.filter((x) => x.id !== s.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button className="btn small" type="submit">Merge</button>
              </form>
            )}
          </details>
        ))}
        <form action={addSubject} className="card">
          <strong>Add someone or something</strong>
          <input type="text" name="name" placeholder="e.g. Arpita's mum, Vet clinic, Second car" required aria-label="Name" />
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <select name="kind" defaultValue="person" aria-label="Kind">
              {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select name="colour" defaultValue="teal" aria-label="Colour">
              {COLOURS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button className="btn primary" type="submit">Add</button>
          <p className="hint">Next, you can tag past notes that mention them.</p>
        </form>
      </section>

      <section className="section" id="areas">
        <span className="eyebrow">Areas</span>
        {areas.map((a) => (
          <details key={a.id} className="card" style={{ opacity: a.archived ? 0.6 : 1 }}>
            <summary className="row" style={{ cursor: "pointer", listStyle: "none" }}>
              <strong>{a.name}</strong>
              {a.archived && <span className="sub">archived</span>}
              <span className="spacer" />
              <span className="sub">Edit</span>
            </summary>
            <form action={updateArea} className="row" style={{ marginTop: 8, flexWrap: "nowrap" }}>
              <input type="hidden" name="id" value={a.id} />
              <input type="text" name="name" defaultValue={a.name} aria-label="Name" />
              <button className="btn small primary" type="submit">Rename</button>
            </form>
            <div className="actions" style={{ marginTop: 8 }}>
              <form action={archiveArea}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="archived" value={a.archived ? "false" : "true"} />
                <button className="btn small" type="submit">{a.archived ? "Restore" : "Archive"}</button>
              </form>
            </div>
            {!a.archived && activeAreas.length > 1 && (
              <form action={mergeArea} className="row" style={{ marginTop: 8, flexWrap: "nowrap" }}>
                <input type="hidden" name="id" value={a.id} />
                <select name="into" defaultValue="" aria-label="Merge into">
                  <option value="" disabled>Merge into…</option>
                  {activeAreas.filter((x) => x.id !== a.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button className="btn small" type="submit">Merge</button>
              </form>
            )}
          </details>
        ))}
        <form action={addArea} className="card">
          <strong>Add an area</strong>
          <input type="text" name="name" placeholder="e.g. Travel, School" required aria-label="Area name" />
          <button className="btn primary" type="submit">Add</button>
        </form>
      </section>
    </>
  );
}
