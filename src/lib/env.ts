// Central place for configuration. Read lazily so a missing optional key only fails the feature that needs it.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. See SETUP.md.`);
  return v;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY"),
  allowedEmails: () =>
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  appUrl: () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  googleClientId: () => required("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => required("GOOGLE_CLIENT_SECRET"),
  cronSecret: () => required("CRON_SECRET"),
  vapidPublicKey: () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: () => required("VAPID_PRIVATE_KEY"),
  vapidSubject: () => process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  monthlyCapUsd: () => Number(process.env.AI_MONTHLY_CAP_USD ?? "10"),
  /** Local development only: act as this user without Google sign-in. Ignored in production. */
  devUser: (): { id: string; email: string } | null => {
    if (process.env.NODE_ENV === "production") return null;
    const id = process.env.DEV_AUTH_USER_ID;
    return id ? { id, email: process.env.DEV_AUTH_EMAIL ?? "dev@example.com" } : null;
  },
};

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = env.allowedEmails();
  return allowed.length > 0 && allowed.includes(email.toLowerCase());
}
