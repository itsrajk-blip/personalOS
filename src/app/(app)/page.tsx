import Link from "next/link";
import { after } from "next/server";
import { dismissItem, keepItem } from "./actions";
import { FollowupCard } from "@/components/FollowupCard";
import { TagRow } from "@/components/Tags";
import { adminStore, requireContext } from "@/lib/auth";
import { longDate, shortDate, todayIn } from "@/lib/dates";
import { dueLabel, groupForToday } from "@/lib/followups";
import { syncGmail } from "@/lib/gmail/sync";
import type { FollowupView, ItemView } from "@/lib/types";

const SYNC_IF_OLDER_THAN_MS = 10 * 60 * 1000;

export default async function TodayPage() {
  const { store, user } = await requireContext();
  const { timezone } = await store.appState();
  const today = todayIn(timezone);
  const [followups, review, toCheck, gmail] = await Promise.all([
    store.openFollowups(),
    store.reviewItems(),
    store.items({ statuses: ["failed", "ready"], limit: 30 }).then((xs) => xs.filter((x) => x.status === "failed" || x.needs_check)),
    store.gmailAccount(),
  ]);
  const b = groupForToday(followups, today);

  // Opening the app also checks Gmail, if the scheduled check hasn't run recently.
  if (gmail && (!gmail.last_sync_at || Date.now() - Date.parse(gmail.last_sync_at) > SYNC_IF_OLDER_THAN_MS)) {
    after(() => syncGmail(adminStore(user.id), { budgetMs: 20_000 }).then(() => undefined));
  }

  const nothing = !b.overdue.length && !b.today.length && !review.length && !b.upcoming.length && !b.anytime.length && !b.waiting.length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{longDate(today)}</div>
          <h1>Today</h1>
        </div>
        <span className="sub mono">
          {b.overdue.length} overdue · {b.today.length} due
        </span>
      </div>

      <Section title="Overdue" items={b.overdue} today={today} />
      <Section title="Due today" items={b.today} today={today} />

      {review.length > 0 && (
        <div className="section">
          <div className="section-head">
            <span className="eyebrow">New from Gmail</span>
            <span className="eyebrow">{review.length}</span>
          </div>
          {review.map((it) => (
            <ReviewCard key={it.id} item={it} today={today} />
          ))}
        </div>
      )}

      <Section title="Coming up" items={b.upcoming} today={today} />
      <Section title="To do, no date" items={b.anytime} today={today} />
      <Section title="Waiting on" items={b.waiting} today={today} />

      {toCheck.length > 0 && (
        <div className="section">
          <span className="eyebrow">Check these tags</span>
          <div className="list">
            {toCheck.slice(0, 5).map((it) => (
              <Link key={it.id} href={`/items/${it.id}`}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.summary ?? it.original_text?.slice(0, 60) ?? "Photo"}
                </span>
                <span className="v">{it.status === "failed" ? "Not filed" : "Unsure"}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {b.snoozedCount > 0 && <p className="hint">{b.snoozedCount} snoozed item{b.snoozedCount === 1 ? "" : "s"} will come back on their date.</p>}

      {nothing && (
        <div className="empty">
          <p>Nothing due. </p>
          <p>
            Tap <Link href="/capture">Capture</Link> to note something down
            {gmail ? "." : <>, or <Link href="/settings">connect Gmail</Link>.</>}
          </p>
        </div>
      )}
    </>
  );
}

function Section({ title, items, today }: { title: string; items: FollowupView[]; today: string }) {
  if (!items.length) return null;
  return (
    <div className="section">
      <div className="section-head">
        <span className="eyebrow">{title}</span>
        <span className="eyebrow">{items.length}</span>
      </div>
      {items.map((f) => (
        <FollowupCard key={f.id} f={f} today={today} />
      ))}
    </div>
  );
}

function ReviewCard({ item, today }: { item: ItemView; today: string }) {
  const open = item.followups.filter((f) => f.status === "open");
  return (
    <div className="card task new">
      <div className="task-top">
        <Link href={`/items/${item.id}`} className="task-title" style={{ color: "var(--ink)" }}>
          {item.summary ?? item.email_subject ?? "Email"}
        </Link>
        <span className="state new">New</span>
      </div>
      {open.map((f) => (
        <div key={f.id} className="hint">
          {f.direction === "waiting_on_them" ? "Waiting on: " : "To do: "}
          {f.title} · {dueLabel(f.due_date, today)}
        </div>
      ))}
      <div className="meta">
        <TagRow subjects={item.subjects} areas={item.areas} />
        <span className="mono" style={{ fontSize: 11 }}>
          {item.email_from ?? "Gmail"}
          {item.happened_on ? ` · ${shortDate(item.happened_on, today)}` : ""}
        </span>
      </div>
      <div className="actions">
        <form action={keepItem}>
          <input type="hidden" name="id" value={item.id} />
          <button className="btn small primary" type="submit">Keep</button>
        </form>
        <form action={dismissItem}>
          <input type="hidden" name="id" value={item.id} />
          <button className="btn small" type="submit">Dismiss</button>
        </form>
        <Link className="btn small" href={`/items/${item.id}`}>Open</Link>
      </div>
    </div>
  );
}
