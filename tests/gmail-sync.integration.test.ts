// End-to-end Gmail sync against a real database, with Gmail and the AI faked.
// Runs only when INTEGRATION_SUPABASE_URL and INTEGRATION_SECRET_KEY point at a test database
// (see supabase/tests). Skipped otherwise.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Extraction } from "@/lib/ai/extract";

const URL_ = process.env.INTEGRATION_SUPABASE_URL;
const KEY = process.env.INTEGRATION_SECRET_KEY;
const OWNER = "bbbbbbbb-0000-4000-8000-000000000002";

// Fake AI: decides from the email text.
vi.mock("@/lib/ai/client", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/client")>();
  return {
    ...real,
    assertUnderCap: async () => {},
    anthropic: () => ({
      messages: {
        parse: async (req: { messages: { content: { type: string; text?: string }[] }[] }) => {
          const text = req.messages[0].content.map((b) => b.text ?? "").join("\n");
          const insurer = text.includes("10 business days");
          const out: Extraction = {
            relevant: insurer,
            summary: insurer ? "Insurer will respond to claim within 10 business days" : "Newsletter",
            happened_on: null,
            subjects: ["Joey"],
            areas: ["Insurance"],
            followups: insurer ? [{ title: "Chase insurer about claim", direction: "waiting_on_them", due_date: "2026-10-12" }] : [],
            new_subject: null,
            confidence: "high",
          };
          return { parsed_output: out, stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 100 } };
        },
      },
    }),
  };
});

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const MESSAGES: Record<string, unknown> = {
  m1: {
    id: "m1", threadId: "t1", labelIds: ["INBOX", "CATEGORY_UPDATES"], internalDate: String(Date.parse("2026-09-28T01:00:00Z")),
    payload: {
      mimeType: "text/plain",
      headers: [{ name: "From", value: "Pet Insurance <claims@insurer.example>" }, { name: "To", value: "raj@example.com" }, { name: "Subject", value: "Claim received" }],
      body: { data: b64("We will respond within 10 business days.") },
    },
  },
  m2: {
    id: "m2", threadId: "t2", labelIds: ["INBOX", "CATEGORY_PROMOTIONS"],
    payload: { mimeType: "text/plain", headers: [{ name: "Subject", value: "50% off" }], body: { data: b64("Sale") } },
  },
  m3: {
    id: "m3", threadId: "t3", labelIds: ["INBOX"],
    payload: { mimeType: "text/plain", headers: [{ name: "From", value: "news@example.com" }, { name: "Subject", value: "Weekly" }], body: { data: b64("Our weekly news") } },
  },
};

function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  if (url.hostname === "oauth2.googleapis.com") return json({ access_token: "at" });
  if (url.hostname === "gmail.googleapis.com") {
    const path = url.pathname.replace("/gmail/v1/users/me", "");
    if (path === "/messages") return json({ messages: [{ id: "m1", threadId: "t1" }, { id: "m2", threadId: "t2" }] });
    if (path === "/history") return json({ history: [{ messagesAdded: [{ message: { id: "m3" } }] }], historyId: "200" });
    const m = path.match(/^\/messages\/(\w+)$/);
    if (m) return MESSAGES[m[1]] ? json(MESSAGES[m[1]]) : json({}, 404);
  }
  return realFetch(input as RequestInfo, init);
}
const realFetch = globalThis.fetch;

describe.skipIf(!URL_ || !KEY)("Gmail sync (integration)", () => {
  const db = createClient(URL_ ?? "http://x", KEY ?? "x", { auth: { persistSession: false } });

  beforeAll(async () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    globalThis.fetch = fakeFetch as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it("imports, filters and files emails, and doesn't redo work on the next run", async () => {
    const { Store } = await import("@/lib/store");
    const { encrypt } = await import("@/lib/crypto");
    const { syncGmail } = await import("@/lib/gmail/sync");
    const store = new Store(db, OWNER);
    await store.ensureSeeded();
    await store.saveGmailAccount("raj@example.com", encrypt("refresh"), "100");

    const first = await syncGmail(store);
    expect(first.error).toBeUndefined();
    expect(first.queued).toBe(3);
    expect(first.processed).toBe(3);
    expect(first.kept).toBe(1); // m1 kept; m2 promotions (free filter), m3 judged irrelevant by AI

    const items = await store.items({ statuses: ["ready", "review"] });
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("ready"); // from the 90-day import, so filed without review
    expect(items[0].subjects.map((s) => s.name)).toEqual(["Joey"]);
    expect(items[0].followups[0]).toMatchObject({ direction: "waiting_on_them", due_date: "2026-10-12", status: "open" });

    const account = await store.gmailAccount();
    expect(account).toMatchObject({ backfill_status: "done", history_id: "200", last_error: null });

    const second = await syncGmail(store);
    expect(second.processed).toBe(0);
  });
});
