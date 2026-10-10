"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminStore, requireContext } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import { syncGmail } from "@/lib/gmail/sync";
import { adminClient } from "@/lib/supabase/server";
import type { Direction, SubjectKind } from "@/lib/types";

const KINDS: SubjectKind[] = ["person", "pet", "home", "vehicle", "place", "other"];

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function refresh() {
  revalidatePath("/", "layout");
}

// ---------- Follow-ups ----------

export async function completeFollowup(form: FormData) {
  const { store } = await requireContext();
  await store.updateFollowup(str(form, "id"), { status: "done", completed_at: new Date().toISOString() });
  refresh();
}

export async function reopenFollowup(form: FormData) {
  const { store } = await requireContext();
  await store.updateFollowup(str(form, "id"), { status: "open", completed_at: null, snoozed_until: null });
  refresh();
}

export async function dismissFollowup(form: FormData) {
  const { store } = await requireContext();
  await store.updateFollowup(str(form, "id"), { status: "dismissed" });
  refresh();
}

export async function snoozeFollowup(form: FormData) {
  const { store } = await requireContext();
  const until = str(form, "until");
  if (!isIsoDate(until)) return;
  await store.updateFollowup(str(form, "id"), { snoozed_until: until });
  refresh();
}

export async function setFollowupDate(form: FormData) {
  const { store } = await requireContext();
  const due = str(form, "due_date");
  await store.updateFollowup(str(form, "id"), { due_date: isIsoDate(due) ? due : null, snoozed_until: null });
  refresh();
}

export async function addFollowup(form: FormData) {
  const { store } = await requireContext();
  const title = str(form, "title");
  if (!title) return;
  const direction: Direction = str(form, "direction") === "waiting_on_them" ? "waiting_on_them" : "on_me";
  const due = str(form, "due_date");
  await store.addFollowup(str(form, "item_id"), title, direction, isIsoDate(due) ? due : null);
  refresh();
}

// ---------- Items ----------

export async function keepItem(form: FormData) {
  const { store } = await requireContext();
  await store.setItemStatus(str(form, "id"), "ready");
  refresh();
}

export async function dismissItem(form: FormData) {
  const { store } = await requireContext();
  await store.setItemStatus(str(form, "id"), "dismissed");
  refresh();
}

export async function saveTags(form: FormData) {
  const { store } = await requireContext();
  const itemId = str(form, "item_id");
  const subjectIds = form.getAll("subject").map(String);
  const areaIds = form.getAll("area").map(String);
  const newName = str(form, "new_subject");
  if (newName) {
    const kind = KINDS.includes(str(form, "new_kind") as SubjectKind) ? (str(form, "new_kind") as SubjectKind) : "other";
    const s = await store.addSubject(newName, kind);
    subjectIds.push(s.id);
  }
  const newArea = str(form, "new_area");
  if (newArea) areaIds.push((await store.addArea(newArea)).id);
  await store.setItemTags(itemId, [...new Set(subjectIds)], [...new Set(areaIds)]);
  const summary = str(form, "summary");
  const happened = str(form, "happened_on");
  await store.updateItemText(itemId, {
    summary: summary || null,
    happened_on: isIsoDate(happened) ? happened : null,
  });
  refresh();
  redirect(`/items/${itemId}?saved=1`);
}

export async function deleteItem(form: FormData) {
  const { store } = await requireContext();
  const deleted = await store.deleteItem(str(form, "id"));
  if (deleted?.photo_path) {
    await adminClient().storage.from("photos").remove([deleted.photo_path]);
  }
  refresh();
  redirect("/");
}

// ---------- Who and areas ----------

export async function addSubject(form: FormData) {
  const { store } = await requireContext();
  const name = str(form, "name");
  if (!name) return;
  const kind = KINDS.includes(str(form, "kind") as SubjectKind) ? (str(form, "kind") as SubjectKind) : "other";
  const s = await store.addSubject(name, kind, str(form, "colour") || "slate");
  refresh();
  redirect(`/settings/lists/find?subject=${s.id}`);
}

export async function updateSubject(form: FormData) {
  const { store } = await requireContext();
  const kind = str(form, "kind") as SubjectKind;
  await store.updateSubject(str(form, "id"), {
    ...(str(form, "name") ? { name: str(form, "name") } : {}),
    ...(KINDS.includes(kind) ? { kind } : {}),
    ...(str(form, "colour") ? { colour: str(form, "colour") } : {}),
  });
  refresh();
}

export async function archiveSubject(form: FormData) {
  const { store } = await requireContext();
  await store.updateSubject(str(form, "id"), { archived: str(form, "archived") === "true" });
  refresh();
}

export async function mergeSubject(form: FormData) {
  const { store } = await requireContext();
  const into = str(form, "into");
  if (into) await store.mergeSubject(str(form, "id"), into);
  refresh();
}

export async function addArea(form: FormData) {
  const { store } = await requireContext();
  const name = str(form, "name");
  if (name) await store.addArea(name);
  refresh();
}

export async function updateArea(form: FormData) {
  const { store } = await requireContext();
  if (str(form, "name")) await store.updateArea(str(form, "id"), { name: str(form, "name") });
  refresh();
}

export async function archiveArea(form: FormData) {
  const { store } = await requireContext();
  await store.updateArea(str(form, "id"), { archived: str(form, "archived") === "true" });
  refresh();
}

export async function mergeArea(form: FormData) {
  const { store } = await requireContext();
  const into = str(form, "into");
  if (into) await store.mergeArea(str(form, "id"), into);
  refresh();
}

export async function resolveSuggestion(form: FormData) {
  const { store } = await requireContext();
  const accept = str(form, "decision") === "accept";
  const s = await store.resolveSuggestion(str(form, "id"), accept ? "accepted" : "ignored");
  if (accept && s) {
    const kind = KINDS.includes(s.kind as SubjectKind) ? (s.kind as SubjectKind) : "other";
    const subject = await store.addSubject(s.name, kind);
    refresh();
    redirect(`/settings/lists/find?subject=${subject.id}`);
  }
  refresh();
}

export async function tagPastItems(form: FormData) {
  const { store } = await requireContext();
  const subjectId = str(form, "subject");
  await store.addSubjectToItems(subjectId, form.getAll("item").map(String));
  refresh();
  redirect(`/timeline?subject=${subjectId}`);
}

// ---------- Gmail ----------

export async function runGmailNow() {
  const { user } = await requireContext();
  // Uses the secret key: the queue claim function isn't open to signed-in users.
  await syncGmail(adminStore(user.id), { budgetMs: 25_000 });
  refresh();
}

export async function disconnectGmail() {
  const { user } = await requireContext();
  await adminStore(user.id).deleteGmailAccount();
  refresh();
}

// ---------- Data ----------

export async function deleteEverything(form: FormData) {
  const { store } = await requireContext();
  if (str(form, "confirm").toLowerCase() !== "delete") redirect("/settings?error=confirm");
  const paths = await store.photoPaths();
  if (paths.length) await adminClient().storage.from("photos").remove(paths);
  await store.deleteAllData();
  refresh();
  redirect("/settings?deleted=1");
}
