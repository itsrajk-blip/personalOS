import "server-only";
import { AiUnavailableError } from "../ai/client";
import { fileEmail } from "../ai/file";
import { decrypt } from "../crypto";
import { dateOf } from "../dates";
import type { Store } from "../store";
import { Gmail, GmailApiError, GmailAuthError, refreshAccessToken } from "./api";
import { BACKFILL_QUERY, emailAddress, header, messageBody, senderName, skipReason } from "./parse";

export interface SyncResult {
  queued: number;
  processed: number;
  kept: number;
  skipped: number;
  failed: number;
  dueSoon: string[];
  error?: string;
}

const PER_RUN = 25;
const BACKFILL_PAGES_PER_RUN = 3;

/**
 * One sync pass for one owner: queue new message IDs (backfill pages and recent changes),
 * then process a bounded batch from the queue. Safe to run concurrently; the queue claim prevents double work.
 */
export async function syncGmail(store: Store, opts: { budgetMs?: number } = {}): Promise<SyncResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const result: SyncResult = { queued: 0, processed: 0, kept: 0, skipped: 0, failed: 0, dueSoon: [] };

  const account = await store.gmailAccount();
  const tokenEnc = account ? await store.gmailRefreshToken() : null;
  if (!account || !tokenEnc) return result;

  let gmail: Gmail;
  try {
    gmail = new Gmail(await refreshAccessToken(decrypt(tokenEnc)));
  } catch (err) {
    const msg =
      err instanceof GmailAuthError && err.code === "invalid_grant"
        ? "Gmail access was revoked or expired. Reconnect Gmail in Settings."
        : `Couldn't sign in to Gmail: ${(err as Error).message}`;
    await store.updateGmailAccount({ last_error: msg });
    return { ...result, error: msg };
  }

  try {
    // 1. Backfill: walk the last 90 days a few pages at a time.
    if (account.backfill_status !== "done") {
      let pageToken = account.backfill_page_token ?? undefined;
      for (let i = 0; i < BACKFILL_PAGES_PER_RUN; i++) {
        const page = await gmail.listMessages(BACKFILL_QUERY, pageToken);
        const ids = (page.messages ?? []).map((m) => m.id);
        await store.enqueueGmail(ids, true);
        result.queued += ids.length;
        pageToken = page.nextPageToken;
        if (!pageToken) break;
      }
      await store.updateGmailAccount({
        backfill_status: pageToken ? "running" : "done",
        backfill_page_token: pageToken ?? null,
      });
    }

    // 2. New mail since the last check, from Gmail's change history.
    if (account.history_id) {
      try {
        let pageToken: string | undefined;
        let latest = account.history_id;
        do {
          const h = await gmail.history(account.history_id, pageToken);
          const ids = (h.history ?? []).flatMap((x) => (x.messagesAdded ?? []).map((m) => m.message.id));
          await store.enqueueGmail([...new Set(ids)], false);
          result.queued += ids.length;
          latest = h.historyId;
          pageToken = h.nextPageToken;
        } while (pageToken);
        await store.updateGmailAccount({ history_id: latest });
      } catch (err) {
        // History older than about a week expires. Catch up with a short search and restart from now.
        if (err instanceof GmailApiError && err.status === 404) {
          const recent = await gmail.listMessages("newer_than:7d -in:chats -in:spam -in:trash");
          await store.enqueueGmail((recent.messages ?? []).map((m) => m.id), false);
          const profile = await gmail.profile();
          await store.updateGmailAccount({ history_id: profile.historyId });
        } else throw err;
      }
    }

    // 3. Process a batch from the queue.
    const ownerEmail = account.email.toLowerCase();
    while (Date.now() - started < budget) {
      const batch = await store.claimGmailQueue(5);
      if (!batch.length) break;
      for (const q of batch) {
        result.processed++;
        try {
          const outcome = await processMessage(store, gmail, q.message_id, q.from_backfill, ownerEmail);
          if (outcome.kept) {
            result.kept++;
            result.dueSoon.push(...outcome.dueSoon);
          } else result.skipped++;
          await store.finishGmailQueue(q.message_id, outcome.kept ? "done" : "skipped");
        } catch (err) {
          if (err instanceof AiUnavailableError) {
            // Put it back; it'll be picked up when the AI is available again.
            await store.finishGmailQueue(q.message_id, "pending");
            throw err;
          }
          result.failed++;
          await store.finishGmailQueue(q.message_id, err instanceof GmailApiError && err.status === 404 ? "skipped" : "failed");
        }
      }
      if (result.processed >= PER_RUN) break;
    }

    await store.updateGmailAccount({ last_sync_at: new Date().toISOString(), last_error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await store.updateGmailAccount({ last_sync_at: new Date().toISOString(), last_error: msg.slice(0, 300) });
    result.error = msg;
  }
  return result;
}

async function processMessage(
  store: Store,
  gmail: Gmail,
  messageId: string,
  fromBackfill: boolean,
  ownerEmail: string,
): Promise<{ kept: boolean; dueSoon: string[] }> {
  const msg = await gmail.message(messageId);
  if (skipReason(msg)) return { kept: false, dueSoon: [] };

  const from = header(msg, "From");
  const sentByOwner = emailAddress(from) === ownerEmail || (msg.labelIds ?? []).includes("SENT");
  const body = messageBody(msg);
  const subject = header(msg, "Subject");
  const sentAt = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date();
  const { timezone } = await store.appState();

  let item;
  try {
    item = await store.createItem({
      source: "gmail",
      original_text: body.slice(0, 4000),
      gmail_message_id: msg.id,
      gmail_thread_id: msg.threadId,
      email_from: sentByOwner ? `Me → ${senderName(header(msg, "To"))}` : senderName(from),
      email_subject: subject,
      happened_on: dateOf(sentAt, timezone),
    });
  } catch (err) {
    // Already imported (unique per message): nothing to do.
    if (String((err as Error).message).includes("duplicate")) return { kept: false, dueSoon: [] };
    throw err;
  }

  try {
    const res = await fileEmail(
      store,
      item.id,
      { from, to: header(msg, "To"), date: sentAt.toISOString(), subject, body, sentByOwner, threadId: msg.threadId },
      fromBackfill,
    );
    if (!res.relevant) {
      await store.deleteItem(item.id);
      return { kept: false, dueSoon: [] };
    }
    return { kept: true, dueSoon: fromBackfill ? [] : res.dueSoon };
  } catch (err) {
    await store.deleteItem(item.id);
    throw err;
  }
}
