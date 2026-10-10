import type { Area, Subject } from "@/lib/types";

export function colourVar(colour: string): string {
  return `var(--c-${colour}, var(--c-slate))`;
}

export function SubjectChip({ s }: { s: Pick<Subject, "name" | "colour"> }) {
  return (
    <span className="chip">
      <span className="dot" style={{ background: colourVar(s.colour) }} />
      {s.name}
    </span>
  );
}

export function AreaChip({ a }: { a: Pick<Area, "name"> }) {
  return <span className="chip">{a.name}</span>;
}

export function TagRow({ subjects, areas }: { subjects: Subject[]; areas: Area[] }) {
  if (!subjects.length && !areas.length) return <span className="chip">Untagged</span>;
  return (
    <>
      {subjects.map((s) => (
        <SubjectChip key={s.id} s={s} />
      ))}
      {areas.map((a) => (
        <AreaChip key={a.id} a={a} />
      ))}
    </>
  );
}
