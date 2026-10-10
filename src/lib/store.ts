// Data access for one owner. Every query filters on owner_id explicitly, on top of row level security,
// because background jobs use the secret key, which bypasses RLS.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AREAS, DEFAULT_SUBJECTS } from "./seed";
import type {
  Area,
  Direction,
  Followup,
  FollowupView,
  GmailAccount,
  Item,
  ItemSource,
  ItemStatus,
  ItemView,
  PushSubscriptionRow,
  Subject,
  SubjectKind,
  SubjectSuggestion,
} from "./types";

type Row = Record<string, unknown>;

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export interface NewItem {
  source: ItemSource;
  original_text?: string | null;
  photo_path?: string | null;
  gmail_message_id?: string | null;
  gmail_thread_id?: string | null;
  email_from?: string | null;
  email_subject?: string | null;
  happened_on?: string | null;
  status?: ItemStatus;
}

export interface FiledResult {
  summary: string | null;
  happened_on: string | null;
  status: ItemStatus;
  needs_check: boolean;
  ai_model: string | null;
  subjectIds: string[];
  areaIds: string[];
  followups: { title: string; direction: Direction; due_date: string | null; status?: "open" | "dismissed" }[];
}

export interface ItemQuery {
  subjectIds?: string[];
  areaIds?: string[];
  from?: string | null;
  to?: string | null;
  text?: string | null;
  statuses?: ItemStatus[];
  limit?: number;
}

const ITEM_SELECT = "*, item_subjects(subject_id), item_areas(area_id), followups(*)";
const VISIBLE: ItemStatus[] = ["ready", "failed", "processing"];

export class Store {
  private subjectsCache: Subject[] | null = null;
  private areasCache: Area[] | null = null;

  constructor(
    readonly db: SupabaseClient,
    readonly ownerId: string,
  ) {}

  // ---------- Setup ----------

  /** Creates the default who and area lists on first sign-in. Safe to call repeatedly. */
  async ensureSeeded(): Promise<void> {
    const state = check(
      await this.db.from("app_state").select("seeded").eq("owner_id", this.ownerId).maybeSingle(),
      "read app state",
    );
    if (state?.seeded) return;
    check(
      await this.db.from("subjects").upsert(
        DEFAULT_SUBJECTS.map((s) => ({ ...s, owner_id: this.ownerId })),
        { onConflict: "owner_id,name", ignoreDuplicates: true },
      ),
      "seed subjects",
    );
    check(
      await this.db.from("areas").upsert(
        DEFAULT_AREAS.map((name) => ({ name, owner_id: this.ownerId })),
        { onConflict: "owner_id,name", ignoreDuplicates: true },
      ),
      "seed areas",
    );
    check(
      await this.db.from("app_state").upsert({ owner_id: this.ownerId, seeded: true }, { onConflict: "owner_id" }),
      "mark seeded",
    );
    this.subjectsCache = null;
    this.areasCache = null;
  }

  async appState(): Promise<{ timezone: string; last_morning_push: string | null }> {
    const row = check(
      await this.db.from("app_state").select("timezone, last_morning_push").eq("owner_id", this.ownerId).maybeSingle(),
      "read app state",
    );
    return { timezone: row?.timezone ?? "Australia/Melbourne", last_morning_push: row?.last_morning_push ?? null };
  }

  async setLastMorningPush(date: string): Promise<void> {
    check(
      await this.db
        .from("app_state")
        .upsert({ owner_id: this.ownerId, last_morning_push: date }, { onConflict: "owner_id" }),
      "save morning push date",
    );
  }

  // ---------- Who and areas ----------

  async subjects(includeArchived = false): Promise<Subject[]> {
    if (!this.subjectsCache) {
      this.subjectsCache = check(
        await this.db.from("subjects").select("*").eq("owner_id", this.ownerId).order("created_at"),
        "list subjects",
      ) as Subject[];
    }
    return includeArchived ? this.subjectsCache : this.subjectsCache.filter((s) => !s.archived);
  }

  async areas(includeArchived = false): Promise<Area[]> {
    if (!this.areasCache) {
      this.areasCache = check(
        await this.db.from("areas").select("*").eq("owner_id", this.ownerId).order("created_at"),
        "list areas",
      ) as Area[];
    }
    return includeArchived ? this.areasCache : this.areasCache.filter((a) => !a.archived);
  }

  async addSubject(name: string, kind: SubjectKind, colour = "slate"): Promise<Subject> {
    this.subjectsCache = null;
    const row = check(
      await this.db
        .from("subjects")
        .upsert({ owner_id: this.ownerId, name: name.trim(), kind, colour, archived: false }, { onConflict: "owner_id,name" })
        .select()
        .single(),
      "add subject",
    );
    await this.db
      .from("subject_suggestions")
      .update({ status: "accepted" })
      .eq("owner_id", this.ownerId)
      .ilike("name", name.trim());
    return row as Subject;
  }

  async updateSubject(id: string, patch: Partial<Pick<Subject, "name" | "kind" | "archived" | "colour">>): Promise<void> {
    this.subjectsCache = null;
    check(await this.db.from("subjects").update(patch).eq("owner_id", this.ownerId).eq("id", id), "update subject");
  }

  async addArea(name: string): Promise<Area> {
    this.areasCache = null;
    const row = check(
      await this.db
        .from("areas")
        .upsert({ owner_id: this.ownerId, name: name.trim(), archived: false }, { onConflict: "owner_id,name" })
        .select()
        .single(),
      "add area",
    );
    return row as Area;
  }

  async updateArea(id: string, patch: Partial<Pick<Area, "name" | "archived">>): Promise<void> {
    this.areasCache = null;
    check(await this.db.from("areas").update(patch).eq("owner_id", this.ownerId).eq("id", id), "update area");
  }

  /** Moves every tag from one subject to another, then archives the old one. */
  async mergeSubject(fromId: string, intoId: string): Promise<void> {
    if (fromId === intoId) return;
    const links = check(
      await this.db.from("item_subjects").select("item_id, set_by").eq("owner_id", this.ownerId).eq("subject_id", fromId),
      "read tags to merge",
    ) as { item_id: string; set_by: string }[];
    if (links.length) {
      check(
        await this.db.from("item_subjects").upsert(
          links.map((l) => ({ item_id: l.item_id, subject_id: intoId, owner_id: this.ownerId, set_by: l.set_by })),
          { onConflict: "item_id,subject_id", ignoreDuplicates: true },
        ),
        "merge tags",
      );
      check(
        await this.db.from("item_subjects").delete().eq("owner_id", this.ownerId).eq("subject_id", fromId),
        "remove old tags",
      );
    }
    await this.updateSubject(fromId, { archived: true });
  }

  async mergeArea(fromId: string, intoId: string): Promise<void> {
    if (fromId === intoId) return;
    const links = check(
      await this.db.from("item_areas").select("item_id, set_by").eq("owner_id", this.ownerId).eq("area_id", fromId),
      "read tags to merge",
    ) as { item_id: string; set_by: string }[];
    if (links.length) {
      check(
        await this.db.from("item_areas").upsert(
          links.map((l) => ({ item_id: l.item_id, area_id: intoId, owner_id: this.ownerId, set_by: l.set_by })),
          { onConflict: "item_id,area_id", ignoreDuplicates: true },
        ),
        "merge tags",
      );
      check(await this.db.from("item_areas").delete().eq("owner_id", this.ownerId).eq("area_id", fromId), "remove old tags");
    }
    await this.updateArea(fromId, { archived: true });
  }

  async suggestSubject(name: string, kind: string): Promise<void> {
    const clean = name.trim();
    if (!clean) return;
    const existing = check(
      await this.db
        .from("subject_suggestions")
        .select("id, mentions, status")
        .eq("owner_id", this.ownerId)
        .ilike("name", clean)
        .maybeSingle(),
      "read suggestion",
    ) as { id: string; mentions: number; status: string } | null;
    if (existing) {
      if (existing.status === "pending") {
        await this.db.from("subject_suggestions").update({ mentions: existing.mentions + 1 }).eq("id", existing.id);
      }
      return;
    }
    await this.db.from("subject_suggestions").insert({ owner_id: this.ownerId, name: clean, kind });
  }

  /** Suggestions mentioned at least twice, so one-off names don't nag. */
  async pendingSuggestions(): Promise<SubjectSuggestion[]> {
    return check(
      await this.db
        .from("subject_suggestions")
        .select("id, name, kind, mentions, status")
        .eq("owner_id", this.ownerId)
        .eq("status", "pending")
        .gte("mentions", 2)
        .order("mentions", { ascending: false }),
      "list suggestions",
    ) as SubjectSuggestion[];
  }

  async resolveSuggestion(id: string, status: "accepted" | "ignored"): Promise<SubjectSuggestion | null> {
    return check(
      await this.db
        .from("subject_suggestions")
        .update({ status })
        .eq("owner_id", this.ownerId)
        .eq("id", id)
        .select("id, name, kind, mentions, status")
        .maybeSingle(),
      "resolve suggestion",
    ) as SubjectSuggestion | null;
  }

  // ---------- Items ----------

  async createItem(input: NewItem): Promise<Item> {
    return check(
      await this.db
        .from("items")
        .insert({ ...input, owner_id: this.ownerId, status: input.status ?? "processing" })
        .select()
        .single(),
      "save item",
    ) as Item;
  }

  /** Saves the AI's filing: summary, tags and follow-ups. Replaces earlier AI tags, keeps tags you set yourself. */
  async fileItem(itemId: string, r: FiledResult): Promise<void> {
    check(
      await this.db
        .from("items")
        .update({
          summary: r.summary,
          // Keep the capture date when the AI couldn't tell when it happened.
          ...(r.happened_on ? { happened_on: r.happened_on } : {}),
          status: r.status,
          needs_check: r.needs_check,
          ai_model: r.ai_model,
        })
        .eq("owner_id", this.ownerId)
        .eq("id", itemId),
      "file item",
    );
    await this.db.from("item_subjects").delete().eq("owner_id", this.ownerId).eq("item_id", itemId).eq("set_by", "ai");
    await this.db.from("item_areas").delete().eq("owner_id", this.ownerId).eq("item_id", itemId).eq("set_by", "ai");
    if (r.subjectIds.length) {
      check(
        await this.db.from("item_subjects").upsert(
          r.subjectIds.map((subject_id) => ({ item_id: itemId, subject_id, owner_id: this.ownerId, set_by: "ai" })),
          { onConflict: "item_id,subject_id", ignoreDuplicates: true },
        ),
        "tag subjects",
      );
    }
    if (r.areaIds.length) {
      check(
        await this.db.from("item_areas").upsert(
          r.areaIds.map((area_id) => ({ item_id: itemId, area_id, owner_id: this.ownerId, set_by: "ai" })),
          { onConflict: "item_id,area_id", ignoreDuplicates: true },
        ),
        "tag areas",
      );
    }
    if (r.followups.length) {
      check(
        await this.db.from("followups").insert(
          r.followups.map((f) => ({
            owner_id: this.ownerId,
            item_id: itemId,
            title: f.title,
            direction: f.direction,
            due_date: f.due_date,
            status: f.status ?? "open",
          })),
        ),
        "save follow-ups",
      );
    }
  }

  async markItemFailed(itemId: string): Promise<void> {
    await this.db.from("items").update({ status: "failed" }).eq("owner_id", this.ownerId).eq("id", itemId);
  }

  async setItemStatus(itemId: string, status: ItemStatus): Promise<void> {
    check(await this.db.from("items").update({ status }).eq("owner_id", this.ownerId).eq("id", itemId), "update item");
    if (status === "dismissed") {
      await this.db
        .from("followups")
        .update({ status: "dismissed" })
        .eq("owner_id", this.ownerId)
        .eq("item_id", itemId)
        .eq("status", "open");
    }
  }

  async updateItemText(itemId: string, patch: { summary?: string | null; happened_on?: string | null }): Promise<void> {
    check(await this.db.from("items").update(patch).eq("owner_id", this.ownerId).eq("id", itemId), "update item");
  }

  /** Replaces an item's tags with your own choice. */
  async setItemTags(itemId: string, subjectIds: string[], areaIds: string[]): Promise<void> {
    check(await this.db.from("item_subjects").delete().eq("owner_id", this.ownerId).eq("item_id", itemId), "clear tags");
    check(await this.db.from("item_areas").delete().eq("owner_id", this.ownerId).eq("item_id", itemId), "clear tags");
    if (subjectIds.length) {
      check(
        await this.db
          .from("item_subjects")
          .insert(subjectIds.map((subject_id) => ({ item_id: itemId, subject_id, owner_id: this.ownerId, set_by: "user" }))),
        "tag subjects",
      );
    }
    if (areaIds.length) {
      check(
        await this.db
          .from("item_areas")
          .insert(areaIds.map((area_id) => ({ item_id: itemId, area_id, owner_id: this.ownerId, set_by: "user" }))),
        "tag areas",
      );
    }
    await this.db.from("items").update({ needs_check: false }).eq("owner_id", this.ownerId).eq("id", itemId);
  }

  async addSubjectToItems(subjectId: string, itemIds: string[]): Promise<void> {
    if (!itemIds.length) return;
    check(
      await this.db.from("item_subjects").upsert(
        itemIds.map((item_id) => ({ item_id, subject_id: subjectId, owner_id: this.ownerId, set_by: "user" })),
        { onConflict: "item_id,subject_id", ignoreDuplicates: true },
      ),
      "tag items",
    );
  }

  async deleteItem(itemId: string): Promise<Item | null> {
    return check(
      await this.db.from("items").delete().eq("owner_id", this.ownerId).eq("id", itemId).select().maybeSingle(),
      "delete item",
    ) as Item | null;
  }

  async item(itemId: string): Promise<ItemView | null> {
    const row = check(
      await this.db.from("items").select(ITEM_SELECT).eq("owner_id", this.ownerId).eq("id", itemId).maybeSingle(),
      "read item",
    );
    if (!row) return null;
    return (await this.toViews([row as Row]))[0];
  }

  async itemsByIds(ids: string[]): Promise<ItemView[]> {
    if (!ids.length) return [];
    const rows = check(
      await this.db.from("items").select(ITEM_SELECT).eq("owner_id", this.ownerId).in("id", ids),
      "read items",
    );
    return this.toViews(rows as Row[]);
  }

  /** Items matching tags, dates and text. Tags in the same list are OR'd; subjects and areas are AND'd. */
  async items(q: ItemQuery = {}): Promise<ItemView[]> {
    const limit = q.limit ?? 100;
    let ids: string[] | null = null;
    if (q.subjectIds?.length) {
      ids = await this.idsTagged("item_subjects", "subject_id", q.subjectIds);
    }
    if (q.areaIds?.length) {
      const areaIds = await this.idsTagged("item_areas", "area_id", q.areaIds);
      ids = ids ? ids.filter((id) => areaIds.includes(id)) : areaIds;
    }
    if (ids && !ids.length) return [];

    let query = this.db
      .from("items")
      .select(ITEM_SELECT)
      .eq("owner_id", this.ownerId)
      .in("status", q.statuses ?? VISIBLE);
    if (ids) query = query.in("id", ids.slice(0, 1000));
    if (q.from) query = query.gte("happened_on", q.from);
    if (q.to) query = query.lte("happened_on", q.to);
    if (q.text) query = query.textSearch("search", q.text, { type: "websearch", config: "english" });
    const rows = check(
      await query
        .order("happened_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limit),
      "list items",
    );
    return this.toViews(rows as Row[]);
  }

  /** Items found in Gmail that are waiting for keep or dismiss. */
  async reviewItems(): Promise<ItemView[]> {
    return this.items({ statuses: ["review"], limit: 50 });
  }

  async itemCounts(): Promise<{ bySubject: Record<string, number>; byArea: Record<string, number> }> {
    const [s, a] = await Promise.all([
      this.db.from("item_subjects").select("subject_id, items!inner(status)").eq("owner_id", this.ownerId).in("items.status", VISIBLE),
      this.db.from("item_areas").select("area_id, items!inner(status)").eq("owner_id", this.ownerId).in("items.status", VISIBLE),
    ]);
    const bySubject: Record<string, number> = {};
    const byArea: Record<string, number> = {};
    for (const r of (check(s, "count tags") ?? []) as { subject_id: string }[]) bySubject[r.subject_id] = (bySubject[r.subject_id] ?? 0) + 1;
    for (const r of (check(a, "count tags") ?? []) as { area_id: string }[]) byArea[r.area_id] = (byArea[r.area_id] ?? 0) + 1;
    return { bySubject, byArea };
  }

  private async idsTagged(table: "item_subjects" | "item_areas", col: "subject_id" | "area_id", values: string[]) {
    const rows = check(
      await this.db.from(table).select("item_id").eq("owner_id", this.ownerId).in(col, values),
      "filter by tag",
    ) as { item_id: string }[];
    return [...new Set(rows.map((r) => r.item_id))];
  }

  private async toViews(rows: Row[]): Promise<ItemView[]> {
    const [subjects, areas] = await Promise.all([this.subjects(true), this.areas(true)]);
    const sMap = new Map(subjects.map((s) => [s.id, s]));
    const aMap = new Map(areas.map((a) => [a.id, a]));
    return rows.map((row) => {
      const { item_subjects, item_areas, followups, ...item } = row as Row & {
        item_subjects: { subject_id: string }[];
        item_areas: { area_id: string }[];
        followups: Followup[];
      };
      return {
        ...(item as unknown as Item),
        subjects: (item_subjects ?? []).map((t) => sMap.get(t.subject_id)).filter((s): s is Subject => !!s),
        areas: (item_areas ?? []).map((t) => aMap.get(t.area_id)).filter((a): a is Area => !!a),
        followups: (followups ?? []).sort((x, y) => (x.due_date ?? "9999").localeCompare(y.due_date ?? "9999")),
      };
    });
  }

  // ---------- Follow-ups ----------

  async openFollowups(): Promise<FollowupView[]> {
    const rows = check(
      await this.db
        .from("followups")
        .select(
          "*, item:items!inner(id, source, status, summary, happened_on, email_from, gmail_message_id, item_subjects(subject_id), item_areas(area_id))",
        )
        .eq("owner_id", this.ownerId)
        .eq("status", "open")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(500),
      "list follow-ups",
    ) as (Followup & { item: Row & { item_subjects: { subject_id: string }[]; item_areas: { area_id: string }[] } })[];
    const [subjects, areas] = await Promise.all([this.subjects(true), this.areas(true)]);
    const sMap = new Map(subjects.map((s) => [s.id, s]));
    const aMap = new Map(areas.map((a) => [a.id, a]));
    return rows.map(({ item, ...f }) => {
      const { item_subjects, item_areas, ...rest } = item;
      return {
        ...f,
        item: rest as unknown as FollowupView["item"],
        subjects: item_subjects.map((t) => sMap.get(t.subject_id)).filter((s): s is Subject => !!s),
        areas: item_areas.map((t) => aMap.get(t.area_id)).filter((a): a is Area => !!a),
      };
    });
  }

  async updateFollowup(
    id: string,
    patch: Partial<Pick<Followup, "status" | "snoozed_until" | "due_date" | "title" | "direction" | "completed_at">>,
  ): Promise<void> {
    check(await this.db.from("followups").update(patch).eq("owner_id", this.ownerId).eq("id", id), "update follow-up");
  }

  async addFollowup(itemId: string, title: string, direction: Direction, dueDate: string | null): Promise<void> {
    check(
      await this.db
        .from("followups")
        .insert({ owner_id: this.ownerId, item_id: itemId, title, direction, due_date: dueDate }),
      "add follow-up",
    );
  }

  async openFollowupsForThread(threadId: string): Promise<Pick<Followup, "title" | "direction" | "due_date">[]> {
    const rows = check(
      await this.db
        .from("followups")
        .select("title, direction, due_date, items!inner(gmail_thread_id)")
        .eq("owner_id", this.ownerId)
        .eq("status", "open")
        .eq("items.gmail_thread_id", threadId),
      "read thread follow-ups",
    ) as Pick<Followup, "title" | "direction" | "due_date">[];
    return rows.map(({ title, direction, due_date }) => ({ title, direction, due_date }));
  }

  // ---------- Gmail ----------

  async gmailAccount(): Promise<GmailAccount | null> {
    return check(
      await this.db
        .from("gmail_accounts")
        .select("owner_id, email, history_id, backfill_status, backfill_page_token, last_sync_at, last_error, connected_at")
        .eq("owner_id", this.ownerId)
        .maybeSingle(),
      "read Gmail account",
    ) as GmailAccount | null;
  }

  async gmailRefreshToken(): Promise<string | null> {
    const row = check(
      await this.db.from("gmail_accounts").select("refresh_token_enc").eq("owner_id", this.ownerId).maybeSingle(),
      "read Gmail token",
    ) as { refresh_token_enc: string } | null;
    return row?.refresh_token_enc ?? null;
  }

  async saveGmailAccount(email: string, refreshTokenEnc: string, historyId: string): Promise<void> {
    check(
      await this.db.from("gmail_accounts").upsert(
        {
          owner_id: this.ownerId,
          email,
          refresh_token_enc: refreshTokenEnc,
          history_id: historyId,
          backfill_status: "pending",
          backfill_page_token: null,
          last_error: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "owner_id" },
      ),
      "save Gmail account",
    );
  }

  async updateGmailAccount(
    patch: Partial<Pick<GmailAccount, "history_id" | "backfill_status" | "backfill_page_token" | "last_sync_at" | "last_error">>,
  ): Promise<void> {
    check(await this.db.from("gmail_accounts").update(patch).eq("owner_id", this.ownerId), "update Gmail account");
  }

  async deleteGmailAccount(): Promise<void> {
    await this.db.from("gmail_queue").delete().eq("owner_id", this.ownerId);
    check(await this.db.from("gmail_accounts").delete().eq("owner_id", this.ownerId), "disconnect Gmail");
  }

  async enqueueGmail(messageIds: string[], fromBackfill: boolean): Promise<void> {
    if (!messageIds.length) return;
    check(
      await this.db.from("gmail_queue").upsert(
        messageIds.map((message_id) => ({ owner_id: this.ownerId, message_id, from_backfill: fromBackfill })),
        { onConflict: "owner_id,message_id", ignoreDuplicates: true },
      ),
      "queue Gmail messages",
    );
  }

  async claimGmailQueue(limit: number): Promise<{ message_id: string; from_backfill: boolean }[]> {
    return check(
      await this.db.rpc("claim_gmail_queue", { p_owner: this.ownerId, p_limit: limit }),
      "claim Gmail queue",
    ) as { message_id: string; from_backfill: boolean }[];
  }

  async finishGmailQueue(messageId: string, status: "done" | "skipped" | "failed" | "pending"): Promise<void> {
    await this.db.from("gmail_queue").update({ status }).eq("owner_id", this.ownerId).eq("message_id", messageId);
  }

  async gmailQueueCounts(): Promise<{ pending: number; done: number; skipped: number }> {
    const count = async (statuses: string[]) => {
      const { count } = await this.db
        .from("gmail_queue")
        .select("message_id", { count: "exact", head: true })
        .eq("owner_id", this.ownerId)
        .in("status", statuses);
      return count ?? 0;
    };
    const [pending, done, skipped] = await Promise.all([count(["pending", "processing"]), count(["done"]), count(["skipped", "failed"])]);
    return { pending, done, skipped };
  }

  // ---------- Push ----------

  async pushSubscriptions(): Promise<PushSubscriptionRow[]> {
    return check(
      await this.db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("owner_id", this.ownerId),
      "list push subscriptions",
    ) as PushSubscriptionRow[];
  }

  async savePushSubscription(endpoint: string, p256dh: string, auth: string): Promise<void> {
    check(
      await this.db
        .from("push_subscriptions")
        .upsert({ owner_id: this.ownerId, endpoint, p256dh, auth }, { onConflict: "endpoint" }),
      "save push subscription",
    );
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await this.db.from("push_subscriptions").delete().eq("owner_id", this.ownerId).eq("endpoint", endpoint);
  }

  // ---------- AI spend ----------

  async recordUsage(u: {
    model: string;
    purpose: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_usd: number;
  }): Promise<void> {
    await this.db.from("ai_usage").insert({ ...u, owner_id: this.ownerId });
  }

  async spendSince(isoTimestamp: string): Promise<{ cost: number; calls: number }> {
    const rows = check(
      await this.db.from("ai_usage").select("cost_usd").eq("owner_id", this.ownerId).gte("created_at", isoTimestamp),
      "read AI spend",
    ) as { cost_usd: number | string }[];
    return { cost: rows.reduce((sum, r) => sum + Number(r.cost_usd), 0), calls: rows.length };
  }

  // ---------- Export and delete ----------

  async exportAll(): Promise<Record<string, unknown>> {
    const tables = ["subjects", "areas", "items", "item_subjects", "item_areas", "followups", "ai_usage"] as const;
    const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const t of tables) {
      const cols = t === "items" ? "id, source, original_text, photo_path, gmail_message_id, gmail_thread_id, email_from, email_subject, summary, happened_on, status, created_at" : "*";
      out[t] = check(await this.db.from(t).select(cols).eq("owner_id", this.ownerId), `export ${t}`);
    }
    return out;
  }

  async photoPaths(): Promise<string[]> {
    const rows = check(
      await this.db.from("items").select("photo_path").eq("owner_id", this.ownerId).not("photo_path", "is", null),
      "list photos",
    ) as { photo_path: string }[];
    return rows.map((r) => r.photo_path);
  }

  /** Deletes all captured data. Keeps the who and area lists so the app still works. */
  async deleteAllData(): Promise<void> {
    for (const t of ["followups", "item_subjects", "item_areas", "items", "subject_suggestions", "ai_usage", "gmail_queue"]) {
      check(await this.db.from(t).delete().eq("owner_id", this.ownerId), `delete ${t}`);
    }
  }
}
