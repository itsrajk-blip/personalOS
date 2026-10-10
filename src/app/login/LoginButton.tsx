"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";

export function LoginButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn primary block" type="button" onClick={signIn} disabled={busy}>
        {busy ? "Opening Google…" : "Sign in with Google"}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}
