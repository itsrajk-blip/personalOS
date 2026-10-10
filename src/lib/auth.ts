import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env, isAllowedEmail } from "./env";
import { Store } from "./store";
import { adminClient, userClient } from "./supabase/server";

export interface Ctx {
  user: { id: string; email: string };
  store: Store;
}

/** The signed-in, allowed user and their data store, or null. Cached per request. */
export const getContext = cache(async (): Promise<Ctx | null> => {
  const dev = env.devUser();
  if (dev) {
    const store = new Store(adminClient(), dev.id);
    await store.ensureSeeded();
    return { user: dev, store };
  }
  const supabase = await userClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAllowedEmail(user.email)) return null;
  const store = new Store(supabase, user.id);
  await store.ensureSeeded();
  return { user: { id: user.id, email: user.email! }, store };
});

/** Same as getContext, but sends visitors who aren't signed in to the sign-in page. */
export async function requireContext(): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** A store using the secret key, for jobs and for writes the user's role can't make (Gmail token). */
export function adminStore(ownerId: string): Store {
  return new Store(adminClient(), ownerId);
}
