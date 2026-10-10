import Link from "next/link";
import { colourVar } from "@/components/Tags";
import { requireContext } from "@/lib/auth";
import { shortDate, todayIn } from "@/lib/dates";
import { KIND_LABELS } from "@/lib/seed";
import type { ItemView } from "@/lib/types";

type Search = Promise<{ subject?: string; area?: string; q?: string }>;

export default async function TimelinePage({ searchParams }: { searchParams: Search }) {
  const { subject: subjectId, area: areaId, q } = await searchParams;
  const { store } = await requireContext();
  const [subjects, areas, { timezone }] = await Promise.all([store.subjects(true), store.areas(true), store.appState()]);
  const today = todayIn(timezone);
  const subject = subjects.find((s) => s.id === subjectId);
  const area = areas.find((a) => a.id === areaId);
  const items = await store.items({
    subjectIds: subject ? [subject.id] : undefined,
    areaIds: area ? [area.id] : undefined,
    text: q || null,
    limit: 200,
  });
  const open = items.flatMap((i) => i.followups).filter((f) => f.status === "open").length;

  const title = subject?.name ?? (q ? `“${q}”` : (area?.name ?? "Everything"));
  const briefQuestion = subject
    ? subject.kind === "pet"
      ? `Brief me for ${subject.name}'s vet visit`
      : subject.name === "Me"
        ? `Brief me for my GP visit`
        : area
          ? `Summarise ${subject.name}'s ${area.name.toLowerCase()} records`
          : `Brief me on everything about ${subject.name}`
    : area
      ? `Summarise my ${area.name.toLowerCase()} records`
      : null;
  const filterHref = (a?: string) => {
    const p = new URLSearchParams();
    if (subject) p.set("subject", subject.id);
    if (a) p.set("area", a);
    return `/timeline?${p}`;
  };

  return (
    <>
      <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
        {subject && (
          <div className="avatar" style={{ ["--subject" as string]: colourVar(subject.colour) }}>
            {subject.name.slice(0, 1)}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 24 }}>{title}</h1>
          <p className="sub">
            {subject ? `${KIND_LABELS[subject.kind]} · ` : ""}
            {items.length} item{items.length === 1 ? "" : "s"}
            {open ? ` · ${open} open follow-up${open === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </div>

      {subject && (
        <div className="chips">
          <Link href={filterHref()} className={`chip link ${!area ? "on" : ""}`} style={{ padding: "5px 11px" }}>All</Link>
          {areas.filter((a) => !a.archived).map((a) => (
            <Link key={a.id} href={filterHref(a.id)} className={`chip link ${area?.id === a.id ? "on" : ""}`} style={{ padding: "5px 11px" }}>
              {a.name}
            </Link>
          ))}
        </div>
      )}

      {briefQuestion && items.length > 0 && (
        <Link className="btn primary block" href={`/ask?q=${encodeURIComponent(briefQuestion)}`}>
          {subject?.kind === "pet" ? "Brief me for the vet" : subject?.name === "Me" ? "Brief me for the GP" : "Brief me"}
        </Link>
      )}

      {items.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        <div className="timeline" style={{ ["--subject" as string]: subject ? colourVar(subject.colour) : undefined }}>
          {items.map((it) => (
            <Entry key={it.id} it={it} today={today} />
          ))}
        </div>
      )}
    </>
  );
}

function Entry({ it, today }: { it: ItemView; today: string }) {
  const kind = it.source === "gmail" ? "Gmail" : it.source === "photo" ? "Photo" : "Note";
  const openCount = it.followups.filter((f) => f.status === "open").length;
  return (
    <Link href={`/items/${it.id}`} className="tl-item">
      <span className="tl-date">
        {it.happened_on ? shortDate(it.happened_on, today) : "No date"} · {kind}
        {it.email_from ? ` · ${it.email_from}` : ""}
        {openCount ? ` · ${openCount} open` : ""}
      </span>
      <span style={{ fontSize: 15 }}>{it.summary ?? it.original_text?.slice(0, 140) ?? "Photo"}</span>
      {it.photo_path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/photo/${it.id}`} alt="" className="thumb" loading="lazy" />
      )}
    </Link>
  );
}
