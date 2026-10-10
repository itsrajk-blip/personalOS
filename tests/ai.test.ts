import { describe, expect, it } from "vitest";
import { formatEntries, mergeCandidates, resolvePlan } from "@/lib/ai/ask";
import { contextBlock, resolveExtraction, type Extraction } from "@/lib/ai/extract";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Area, ItemView, Subject } from "@/lib/types";

const subjects: Subject[] = [
  { id: "s-me", owner_id: "o", name: "Me", kind: "person", colour: "indigo", archived: false },
  { id: "s-joey", owner_id: "o", name: "Joey", kind: "pet", colour: "amber", archived: false },
  { id: "s-old", owner_id: "o", name: "Old car", kind: "vehicle", colour: "slate", archived: true },
];
const areas: Area[] = [
  { id: "a-health", owner_id: "o", name: "Health", archived: false },
  { id: "a-ins", owner_id: "o", name: "Insurance", archived: false },
];

const base: Extraction = {
  relevant: true,
  summary: "Scratching left ear again",
  happened_on: "2026-10-10",
  subjects: ["joey"],
  areas: ["Health"],
  followups: [],
  new_subject: null,
  confidence: "high",
};

describe("resolveExtraction", () => {
  const opts = { today: "2026-10-10", model: "m" };

  it("matches names to IDs regardless of case and ignores archived or unknown names", () => {
    const r = resolveExtraction({ ...base, subjects: ["JOEY", "Old car", "Nobody"] }, subjects, areas, opts);
    expect(r.subjectIds).toEqual(["s-joey"]);
    expect(r.areaIds).toEqual(["a-health"]);
    expect(r.needs_check).toBe(false);
    expect(r.status).toBe("ready");
  });

  it("flags low confidence or missing tags for a check", () => {
    expect(resolveExtraction({ ...base, confidence: "low" }, subjects, areas, opts).needs_check).toBe(true);
    expect(resolveExtraction({ ...base, areas: [] }, subjects, areas, opts).needs_check).toBe(true);
  });

  it("drops bad or future dates and duplicate follow-ups", () => {
    const r = resolveExtraction(
      {
        ...base,
        happened_on: "2027-01-01",
        followups: [
          { title: "Book vet", direction: "on_me", due_date: "2026-10-18" },
          { title: "book vet ", direction: "on_me", due_date: "2026-10-18" },
          { title: "Call insurer", direction: "on_me", due_date: "next week" },
        ],
      },
      subjects,
      areas,
      opts,
    );
    expect(r.happened_on).toBeNull();
    expect(r.followups).toHaveLength(2);
    expect(r.followups[1].due_date).toBeNull();
  });

  it("sends new Gmail finds to review, and files backfilled ones with old promises dismissed", () => {
    const x = { ...base, followups: [{ title: "Chase claim", direction: "waiting_on_them" as const, due_date: "2026-08-01" }] };
    expect(resolveExtraction(x, subjects, areas, { ...opts, isEmail: true }).status).toBe("review");
    const back = resolveExtraction(x, subjects, areas, { ...opts, isEmail: true, fromBackfill: true });
    expect(back.status).toBe("ready");
    expect(back.followups[0].status).toBe("dismissed");
  });

  it("only suggests subjects that aren't already listed", () => {
    expect(resolveExtraction({ ...base, new_subject: { name: "joey", kind: "pet" } }, subjects, areas, opts).newSubject).toBeNull();
    expect(resolveExtraction({ ...base, new_subject: { name: "Bella", kind: "pet" } }, subjects, areas, opts).newSubject?.name).toBe("Bella");
  });

  it("builds a context block with today's weekday and the lists", () => {
    const c = contextBlock({ today: "2026-10-10", subjects, areas, existingFollowups: [{ title: "Pay invoice", due_date: "2026-10-24" }] });
    expect(c).toContain("TODAY: 2026-10-10 (Sat)");
    expect(c).toContain("- Joey (pet)");
    expect(c).toContain("Pay invoice (due 2026-10-24)");
  });
});

function view(id: string, date: string, summary = id): ItemView {
  return {
    id, owner_id: "o", source: "text", original_text: `${summary} original`, photo_path: null, gmail_message_id: null,
    gmail_thread_id: null, email_from: null, email_subject: null, summary, happened_on: date, status: "ready",
    needs_check: false, ai_model: null, created_at: `${date}T00:00:00Z`, subjects: [subjects[1]], areas: [areas[0]], followups: [],
  };
}

describe("Ask helpers", () => {
  it("resolves a plan and rejects nonsense dates", () => {
    const p = resolvePlan({ subjects: ["Joey"], areas: ["health"], from_date: "2026-04-10", to_date: "soon", keywords: [" ear ", ""] }, subjects, areas, "2026-10-10");
    expect(p).toEqual({ subjectIds: ["s-joey"], areaIds: ["a-health"], from: "2026-04-10", to: null, keywords: ["ear"] });
  });

  it("merges tag and keyword matches without duplicates, newest first", () => {
    const merged = mergeCandidates([view("a", "2026-09-01"), view("b", "2026-10-01")], [view("b", "2026-10-01"), view("c", "2026-10-05")]);
    expect(merged.map((m) => m.id)).toEqual(["c", "b", "a"]);
  });

  it("numbers entries for citation", () => {
    const text = formatEntries([view("a", "2026-10-06", "Red patch on belly")]);
    expect(text).toMatch(/^\[1\] 2026-10-06 · text · Joey, Health/);
    expect(text).toContain("Summary: Red patch on belly");
  });
});

describe("token encryption", () => {
  it("round-trips and detects tampering", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const enc = encrypt("1//refresh-token");
    expect(enc).not.toContain("refresh");
    expect(decrypt(enc)).toBe("1//refresh-token");
    const [iv, tag, data] = enc.split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decrypt([iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });
});
