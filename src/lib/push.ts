import "server-only";
import webpush from "web-push";
import { env } from "./env";
import type { Store } from "./store";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = env.vapidPublicKey();
  if (!pub || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.vapidSubject(), pub, env.vapidPrivateKey());
  configured = true;
  return true;
}

/** Sends to every device the owner enabled. Removes subscriptions Apple or Google say are gone. */
export async function sendPush(store: Store, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;
  const subs = await store.pushSubscriptions();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12, urgency: "normal" },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await store.deletePushSubscription(s.endpoint);
      }
    }),
  );
  return sent;
}

/** Text for the 7am summary, or null when there's nothing to say. */
export function morningMessage(counts: { overdue: number; today: number; review: number }): PushPayload | null {
  const parts: string[] = [];
  if (counts.today) parts.push(`${counts.today} due today`);
  if (counts.overdue) parts.push(`${counts.overdue} overdue`);
  if (counts.review) parts.push(`${counts.review} new from Gmail`);
  if (!parts.length) return null;
  return { title: "Today", body: parts.join(", "), url: "/", tag: "morning" };
}
