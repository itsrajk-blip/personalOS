import Link from "next/link";
import { completeFollowup, snoozeFollowup } from "@/app/(app)/actions";
import { shortDate } from "@/lib/dates";
import { bucketFor, dueLabel, snoozeTargets } from "@/lib/followups";
import type { FollowupView } from "@/lib/types";
import { TagRow } from "./Tags";

const STYLE: Record<string, string> = { overdue: "overdue", today: "today", waiting: "waiting", upcoming: "", anytime: "", later: "" };

export function sourceLine(item: FollowupView["item"], today: string): string {
  if (item.source === "gmail") return `Gmail${item.email_from ? ` · ${item.email_from}` : ""}`;
  const when = item.happened_on ? ` · ${shortDate(item.happened_on, today)}` : "";
  return `${item.source === "photo" ? "Photo" : "Note"}${when}`;
}

export function FollowupCard({ f, today }: { f: FollowupView; today: string }) {
  const bucket = bucketFor(f, today);
  const style = STYLE[bucket] ?? "";
  const label =
    f.direction === "waiting_on_them" && bucket === "overdue"
      ? `No reply · ${dueLabel(f.due_date, today)}`
      : f.direction === "waiting_on_them" && f.due_date && bucket !== "today"
        ? `Expected ${dueLabel(f.due_date, today).replace(/^(In|Tomorrow)/, (w) => w.toLowerCase())}`
        : dueLabel(f.due_date, today);
  return (
    <div className={`card task ${style}`}>
      <div className="task-top">
        <Link href={`/items/${f.item_id}`} className="task-title" style={{ color: "var(--ink)" }}>
          {f.title}
        </Link>
        <span className={`state ${style}`}>{label}</span>
      </div>
      <div className="meta">
        <TagRow subjects={f.subjects} areas={f.areas} />
        <span className="mono" style={{ fontSize: 11 }}>{sourceLine(f.item, today)}</span>
      </div>
      <div className="actions">
        <form action={completeFollowup}>
          <input type="hidden" name="id" value={f.id} />
          <button className="btn small primary" type="submit">Done</button>
        </form>
        <details className="menu">
          <summary className="btn small">Snooze</summary>
          <div className="menu-list">
            {snoozeTargets(today).map((t) => (
              <form key={t.date} action={snoozeFollowup}>
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="until" value={t.date} />
                <button type="submit">{t.label}</button>
              </form>
            ))}
          </div>
        </details>
        <Link className="btn small" href={`/items/${f.item_id}`}>Open</Link>
      </div>
    </div>
  );
}
