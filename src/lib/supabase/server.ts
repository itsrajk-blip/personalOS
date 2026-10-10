import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "../env";

/** Client acting as the signed-in user, subject to row level security. */
export async function userClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component, where cookies are read-only. Middleware refreshes the session instead.
        }
      },
    },
  });
}

/** Client with the secret key. Bypasses row level security: use only in server code that filters by owner. */
export function adminClient() {
  return createClient(env.supabaseUrl(), env.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
