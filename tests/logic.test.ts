import { describe, expect, it } from "vitest";
import { addDays, daysBetween, hourIn, isIsoDate, todayIn } from "@/lib/dates";
import { bucketFor, dueLabel, groupForToday } from "@/lib/followups";
import { morningMessage } from "@/lib/push";
import type { FollowupView } from "@/lib/types";

describe("dates", () => {
  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-10-10")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("10/10/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("works out Melbourne's date and hour across the UTC day boundary", () => {
    // 20:30 UTC on 9 Oct is 07:30 on 10 Oct in Melbourne (AEDT, UTC+11).
    const t = new Date("2026-10-09T20:30:00Z");
    expect(todayIn("Australia/Melbourne", t)).toBe("2026-10-10");
    expect(hourIn("Australia/Melbourne", t)).toBe(7);
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(daysBetween("2026-10-10", "2026-10-03")).toBe(-7);
  });
});

function f(p: Partial<FollowupView>): FollowupView {
  return {
    id: Math.random().toString(36).slice(2),
    owner_id: "o",
    item_id: "i",
    title: "Thing",
    direction: "on_me",
    due_date: null,
    status: "open",
    snoozed_until: null,
    completed_at: null,
    created_at: "2026-10-01T00:00:00Z",
    item: { id: "i", source: "text", status: "ready", summary: null, happened_on: null, email_from: null, gmail_message_id: null },
    subjects: [],
    areas: [],
    ...p,
  };
}

describe("Today buckets", () => {
  const today = "2026-10-10";

  it("puts a waiting-on promise past its date in overdue", () => {
    expect(bucketFor(f({ direction: "waiting_on_them", due_date: "2026-10-03" }), today)).toBe("overdue");
  });

  it("separates today, upcoming, later and undated", () => {
    expect(bucketFor(f({ due_date: today }), today)).toBe("today");
    expect(bucketFor(f({ due_date: "2026-10-15" }), today)).toBe("upcoming");
    expect(bucketFor(f({ due_date: "2026-11-15" }), today)).toBe("later");
    expect(bucketFor(f({}), today)).toBe("anytime");
    expect(bucketFor(f({ direction: "waiting_on_them", due_date: "2026-10-20" }), today)).toBe("waiting");
  });

  it("hides snoozed items until their date, then brings them back", () => {
    expect(bucketFor(f({ due_date: "2026-10-01", snoozed_until: "2026-10-12" }), today)).toBe("snoozed");
    expect(bucketFor(f({ due_date: "2026-10-01", snoozed_until: "2026-10-10" }), today)).toBe("overdue");
  });

  it("leaves out follow-ups on Gmail items still waiting for review", () => {
    const b = groupForToday(
      [
        f({ due_date: "2026-10-01" }),
        f({ due_date: "2026-10-01", item: { ...f({}).item, status: "review" } }),
        f({ due_date: "2026-10-09", snoozed_until: "2026-10-11" }),
      ],
      today,
    );
    expect(b.overdue).toHaveLength(1);
    expect(b.snoozedCount).toBe(1);
  });

  it("labels due dates plainly", () => {
    expect(dueLabel("2026-10-03", today)).toBe("7 days late");
    expect(dueLabel("2026-10-11", today)).toBe("Tomorrow");
    expect(dueLabel(null, today)).toBe("No date");
  });
});

describe("morning push text", () => {
  it("says nothing when nothing is due", () => {
    expect(morningMessage({ overdue: 0, today: 0, review: 0 })).toBeNull();
  });
  it("summarises counts", () => {
    expect(morningMessage({ overdue: 1, today: 2, review: 0 })?.body).toBe("2 due today, 1 overdue");
  });
});
