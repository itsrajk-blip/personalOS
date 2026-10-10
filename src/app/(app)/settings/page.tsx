import Link from "next/link";
import { deleteEverything, disconnectGmail, runGmailNow } from "../actions";
import { PushSettings } from "./PushSettings";
import { monthStartIso } from "@/lib/ai/client";
import { requireContext } from "@/lib/auth";
import { env } from "@/lib/env";

function ago(iso: string | null): string {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} days ago`;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; error?: string; deleted?: string }>;
}) {
  const sp = await searchParams;
  const { store, user } = await requireContext();
  const [gmail, spend, subjects, areas] = await Promise.all([
    store.gmailAccount(),
    store.spendSince(monthStartIso()),
    store.subjects(),
    store.areas(),
  ]);
  const queue = gmail ? await store.gmailQueueCounts() : null;
  const cap = env.monthlyCapUsd();
  const pct = Math.min(100, (spend.cost / cap) * 100);
  const month = new Date().toLocaleDateString("en-AU", { month: "long" });

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <span className="sub">{user.email}</span>
      </div>

      {sp.gmail === "connected" && <p className="notice">Gmail connected. The first 90 days are importing in the background.</p>}
      {sp.gmail === "error" && <p className="notice warn">Gmail didn&apos;t connect: {sp.error ?? "unknown error"}. Try again.</p>}
      {sp.deleted && <p className="notice">All captured data deleted.</p>}
      {sp.error === "confirm" && <p className="notice warn">Type DELETE to confirm.</p>}

      <div className="section">
        <span className="eyebrow">Gmail</span>
        {gmail ? (
          <>
            <div className="list">
              <div>
                <span>Connected, read-only</span>
                <span className={`state ${gmail.last_error ? "overdue" : "ok"}`}>{gmail.last_error ? "Problem" : "OK"}</span>
              </div>
              <div><span>Account</span><span className="v">{gmail.email}</span></div>
              <div><span>Last check</span><span className="v">{ago(gmail.last_sync_at)}</span></div>
              <div>
                <span>90-day import</span>
                <span className="v">
                  {gmail.backfill_status === "done" && queue?.pending === 0 ? "Done" : `${queue?.pending ?? 0} emails to read`}
                </span>
              </div>
              <div><span>Emails kept</span><span className="v">{queue?.done ?? 0} kept · {queue?.skipped ?? 0} skipped</span></div>
            </div>
            {gmail.last_error && <p className="error">{gmail.last_error}</p>}
            <div className="actions">
              <form action={runGmailNow}>
                <button className="btn small" type="submit">Check now</button>
              </form>
              <a className="btn small" href="/api/gmail/connect">Reconnect</a>
              <form action={disconnectGmail}>
                <button className="btn small danger" type="submit">Disconnect</button>
              </form>
            </div>
          </>
        ) : (
          <div className="card">
            <p>Connect Gmail so bills, appointments and promises to get back to you show up on Today. Read-only: the app can&apos;t send, change or delete email.</p>
            <a className="btn primary" href="/api/gmail/connect">Connect Gmail</a>
            <p className="hint">Google will warn that the app isn&apos;t verified. That&apos;s expected for a private app: choose Advanced, then continue.</p>
          </div>
        )}
      </div>

      <div className="section">
        <span className="eyebrow">Notifications</span>
        <PushSettings vapidKey={env.vapidPublicKey()} />
      </div>

      <div className="section">
        <span className="eyebrow">AI spend · {month}</span>
        <div className="card">
          <div className="row">
            <span>${spend.cost.toFixed(2)} of ${cap.toFixed(2)} limit</span>
            <span className="spacer" />
            <span className="sub">{spend.calls} AI calls</span>
          </div>
          <div className="meter"><i className={pct > 80 ? "high" : ""} style={{ width: `${Math.max(pct, 1)}%` }} /></div>
          <p className="hint">AI calls stop for the rest of the month at the limit. Notes are still saved.</p>
        </div>
      </div>

      <div className="section">
        <span className="eyebrow">Lists</span>
        <div className="list">
          <Link href="/settings/lists#who"><span>Who</span><span className="v">{subjects.length} ›</span></Link>
          <Link href="/settings/lists#areas"><span>Areas</span><span className="v">{areas.length} ›</span></Link>
        </div>
      </div>

      <div className="section">
        <span className="eyebrow">Your data</span>
        <div className="list">
          <a href="/api/export" download>
            <span>Export everything (JSON)</span>
            <span className="v">›</span>
          </a>
          <a href="/auth/signout"><span>Sign out</span><span className="v">›</span></a>
        </div>
        <details>
          <summary className="btn small danger">Delete all captured data</summary>
          <form action={deleteEverything} className="card" style={{ marginTop: 8 }}>
            <p>Deletes every note, photo, email item and follow-up. Your who and area lists stay. Type DELETE to confirm.</p>
            <input type="text" name="confirm" autoComplete="off" aria-label="Type DELETE to confirm" />
            <button className="btn danger" type="submit">Delete everything</button>
          </form>
        </details>
      </div>
    </>
  );
}
