export type SubjectKind = "person" | "pet" | "home" | "vehicle" | "place" | "other";
export type ItemSource = "text" | "photo" | "gmail";
export type ItemStatus = "processing" | "ready" | "review" | "dismissed" | "failed";
export type Direction = "on_me" | "waiting_on_them";
export type FollowupStatus = "open" | "done" | "dismissed";

export interface Subject {
  id: string;
  owner_id: string;
  name: string;
  kind: SubjectKind;
  colour: string;
  archived: boolean;
}

export interface Area {
  id: string;
  owner_id: string;
  name: string;
  archived: boolean;
}

export interface Item {
  id: string;
  owner_id: string;
  source: ItemSource;
  original_text: string | null;
  photo_path: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  email_from: string | null;
  email_subject: string | null;
  summary: string | null;
  happened_on: string | null;
  status: ItemStatus;
  needs_check: boolean;
  ai_model: string | null;
  created_at: string;
}

export interface Followup {
  id: string;
  owner_id: string;
  item_id: string;
  title: string;
  direction: Direction;
  due_date: string | null;
  status: FollowupStatus;
  snoozed_until: string | null;
  completed_at: string | null;
  created_at: string;
}

/** An item with its tags resolved, as the UI shows it. */
export interface ItemView extends Item {
  subjects: Subject[];
  areas: Area[];
  followups: Followup[];
}

export interface FollowupView extends Followup {
  item: Pick<Item, "id" | "source" | "status" | "summary" | "happened_on" | "email_from" | "gmail_message_id">;
  subjects: Subject[];
  areas: Area[];
}

export interface SubjectSuggestion {
  id: string;
  name: string;
  kind: string;
  mentions: number;
  status: "pending" | "accepted" | "ignored";
}

export interface GmailAccount {
  owner_id: string;
  email: string;
  history_id: string | null;
  backfill_status: "pending" | "running" | "done";
  backfill_page_token: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  connected_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
