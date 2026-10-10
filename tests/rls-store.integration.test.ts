// Exercises the data layer as a signed-in user (row level security on), the way production runs it.
// Runs only when INTEGRATION_SUPABASE_URL, INTEGRATION_ANON_KEY and INTEGRATION_USER_JWT are set.
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { Store } from "@/lib/store";

const URL_ = process.env.INTEGRATION_SUPABASE_URL;
const ANON = process.env.INTEGRATION_ANON_KEY;
const JWT = process.env.INTEGRATION_USER_JWT;
const OWNER = process.env.INTEGRATION_USER_ID ?? "";

describe.skipIf(!URL_ || !ANON || !JWT)("Store as a signed-in user", () => {
  const db = createClient(URL_ ?? "http://x", ANON ?? "x", {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${JWT}` } },
  });
  const store = new Store(db, OWNER);

  it("reads every screen's data without permission errors", async () => {
    await store.ensureSeeded();
    expect((await store.subjects()).length).toBeGreaterThan(0);
    await store.items({ limit: 5 });
    await store.items({ text: "joey", limit: 5 });
    await store.openFollowups();
    await store.reviewItems();
    await store.itemCounts();
    await store.pendingSuggestions();
    expect(await store.gmailAccount()).not.toBeNull();
    await store.gmailQueueCounts();
    await store.spendSince("2026-01-01T00:00:00Z");
    await store.appState();
    await store.pushSubscriptions();
    await store.exportAll();
  });

  it("writes a capture, tags, follow-ups and usage", async () => {
    const item = await store.createItem({ source: "text", original_text: "RLS check", happened_on: "2026-10-10" });
    const [me] = await store.subjects();
    const [health] = await store.areas();
    await store.fileItem(item.id, {
      summary: "RLS check", happened_on: null, status: "ready", needs_check: false, ai_model: "m",
      subjectIds: [me.id], areaIds: [health.id], followups: [{ title: "Check", direction: "on_me", due_date: "2026-10-11" }],
    });
    const view = await store.item(item.id);
    expect(view?.happened_on).toBe("2026-10-10");
    expect(view?.followups).toHaveLength(1);
    await store.updateFollowup(view!.followups[0].id, { status: "done" });
    await store.setItemTags(item.id, [me.id], []);
    await store.recordUsage({ model: "m", purpose: "t", input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0 });
    await store.suggestSubject("Test Clinic", "place");
    await store.savePushSubscription("https://push.example/rls", "p", "a");
    await store.deletePushSubscription("https://push.example/rls");
    await store.deleteItem(item.id);
  });

  it("can't use the Gmail token or the queue claim", async () => {
    await expect(store.gmailRefreshToken()).rejects.toThrow(/permission denied/);
    await expect(store.claimGmailQueue(1)).rejects.toThrow(/permission denied/);
  });
});
