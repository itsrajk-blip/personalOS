import "server-only";
import { adminStore } from "./auth";
import { hourIn, todayIn } from "./dates";
import { groupForToday } from "./followups";
import { syncGmail, type SyncResult } from "./gmail/sync";
import { morningMessage, sendPush } from "./push";
import type { Store } from "./store";
import { adminClient } from "./supabase/server";

const MORNING_HOUR = 7;

/** Runs the scheduled work for every owner: Gmail sync, then the 7am summary once a day. */
export async function runTick(): Promise<Record<string, unknown>> {
  const { data, error } = await adminClient().from("app_state").select("owner_id");
  if (error) throw new Error(error.message);
  const report: Record<string, unknown> = {};
  for (const { owner_id } of data as { owner_id: string }[]) {
    report[owner_id] = await tickOwner(adminStore(owner_id));
  }
  return report;
}

export async function tickOwner(store: Store, opts: { budgetMs?: number } = {}) {
  const gmail: SyncResult = await syncGmail(store, opts);
  if (gmail.dueSoon.length) {
    await sendPush(store, {
      title: "New from Gmail",
      body: gmail.dueSoon.length === 1 ? gmail.dueSoon[0] : `${gmail.dueSoon[0]} and ${gmail.dueSoon.length - 1} more`,
      url: "/",
      tag: "gmail",
    });
  }
  const morning = await maybeMorningPush(store);
  return { gmail, morning };
}

export async function maybeMorningPush(store: Store, now = new Date()): Promise<string> {
  const { timezone, last_morning_push } = await store.appState();
  const today = todayIn(timezone, now);
  if (hourIn(timezone, now) < MORNING_HOUR) return "too early";
  if (last_morning_push === today) return "already sent";
  // Record first so overlapping runs can't double-send.
  await store.setLastMorningPush(today);
  const [followups, review] = await Promise.all([store.openFollowups(), store.reviewItems()]);
  const b = groupForToday(followups, today);
  const msg = morningMessage({ overdue: b.overdue.length, today: b.today.length, review: review.length });
  if (!msg) return "nothing to report";
  const sent = await sendPush(store, msg);
  return `sent to ${sent} device(s)`;
}
