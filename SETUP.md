# Setting up PersonalOS

This takes about 45 to 60 minutes. You'll create four accounts, copy some keys into Vercel, and run two SQL snippets. Do the steps in order: later steps need values from earlier ones.

Keep a scratch note open (not in this repo) to paste values into as you go. You'll collect:

| Value | From step |
|---|---|
| Supabase project URL, publishable key, secret key | 1 |
| Anthropic API key | 2 |
| Google client ID and client secret | 3 |
| Your Vercel app URL | 4 |
| Encryption key, cron secret, VAPID keys | 4 |

---

## 1. Supabase (database, sign-in, photo storage)

1. Go to [supabase.com](https://supabase.com), sign up (GitHub sign-in is easiest), and click **New project**.
2. Name: `personalos`. Region: **Sydney**. Set a strong database password and save it in your password manager. Free plan.
3. When the project is ready, open **SQL Editor** → **New query**. Open [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in GitHub, copy the whole file, paste it, and click **Run**. It should say "Success. No rows returned".
4. New query again: paste [`supabase/migrations/0002_storage.sql`](supabase/migrations/0002_storage.sql) and **Run**.
5. Get your **Project URL** (looks like `https://abcd1234.supabase.co`). It isn't on the API Keys page. Easiest: your browser's address bar shows `supabase.com/dashboard/project/abcd1234/...`; your URL is `https://abcd1234.supabase.co`. It's also under the **Connect** button at the top of the dashboard, and in **Project Settings** → **Data API**. Check it by opening `https://abcd1234.supabase.co/rest/v1/` in a browser: a "no API key" error means it's right.
6. Go to **Project Settings** → **API Keys**. Copy:
   - the **publishable** key (`sb_publishable_...`)
   - the **secret** key (`sb_secret_...`). Treat this like a password.

Note: the free plan pauses a project after 7 days with no activity. The 15-minute background job in step 6 keeps it active.

## 2. Anthropic (the AI)

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign up.
2. **Billing**: add a card and buy $10 of credit.
3. **Limits** (under Settings): set a monthly spend limit of **$10**. This is your hard ceiling; the app also stops itself at $10.
4. **API Keys** → **Create key**, name it `personalos`, copy it (`sk-ant-...`). You only see it once.

## 3. Google Cloud (sign-in with Google, and Gmail read access)

One Google OAuth app does both jobs.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), signed in with your Gmail account. Create a project called `personalos`.
2. **APIs & Services** → **Library** → search **Gmail API** → **Enable**.
3. **Google Auth Platform** (older screens call it **OAuth consent screen**):
   - **Branding**: app name `PersonalOS`, support email and developer email = your Gmail.
   - **Audience**: user type **External**. Add your Gmail under **Test users**.
   - **Data Access** → **Add or remove scopes**: tick `.../auth/gmail.readonly`. Save.
4. **Clients** (or **Credentials** → **Create credentials** → **OAuth client ID**): type **Web application**, name `PersonalOS`. Under **Authorised redirect URIs** add both:
   - `https://YOUR-SUPABASE-REF.supabase.co/auth/v1/callback` (your Supabase URL from step 1, plus `/auth/v1/callback`)
   - `https://YOUR-APP-URL/api/gmail/callback` (you'll know the app URL after step 4; come back and add it then)
   
   Click **Create** and copy the **client ID** and **client secret**.
5. **Important, so Gmail access doesn't expire every 7 days:** go back to **Audience** and click **Publish app** to move it from Testing to **In production**. Google will say the app needs verification. You don't need it for personal use: leave it unverified. You'll see an "unverified app" warning when you connect, which you click past.
6. Back in **Supabase** → **Authentication** → **Sign In / Providers** → **Google**: turn it on, paste the client ID and client secret, **Save**.

## 4. Vercel (hosting)

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub.
2. **Add New** → **Project** → import `itsrajk-blip/personalOS`. Framework: Next.js (detected). Don't deploy yet: open **Environment Variables** first.
3. Generate the random values. On a Mac, open Terminal and run each line, copying the output:
   ```
   openssl rand -base64 32        # TOKEN_ENCRYPTION_KEY
   openssl rand -base64 32        # CRON_SECRET (run it again for a different value)
   npx web-push generate-vapid-keys   # gives a Public Key and a Private Key
   ```
4. Add these environment variables (names exactly as shown):

   | Name | Value |
   |---|---|
   | `APP_URL` | leave blank for now |
   | `ALLOWED_EMAILS` | your Gmail address |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
   | `SUPABASE_SECRET_KEY` | Supabase secret key |
   | `ANTHROPIC_API_KEY` | Anthropic key |
   | `AI_MONTHLY_CAP_USD` | `10` |
   | `GOOGLE_CLIENT_ID` | from step 3 |
   | `GOOGLE_CLIENT_SECRET` | from step 3 |
   | `TOKEN_ENCRYPTION_KEY` | first random value |
   | `CRON_SECRET` | second random value |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key |
   | `VAPID_PRIVATE_KEY` | VAPID private key |
   | `VAPID_SUBJECT` | `mailto:` followed by your Gmail address |

5. Click **Deploy**. When it finishes, copy your app URL (like `https://personalos-xyz.vercel.app`).
6. Set `APP_URL` to that URL (no trailing slash): **Settings** → **Environment Variables**, then **Deployments** → latest → **⋯** → **Redeploy**.
7. Finish the loose ends with that URL:
   - Google Cloud → your OAuth client → add the redirect URI `https://YOUR-APP-URL/api/gmail/callback`.
   - Supabase → **Authentication** → **URL Configuration**: **Site URL** = your app URL. Under **Redirect URLs** add `https://YOUR-APP-URL/auth/callback`.

## 5. First run on your iPhone

1. Open your app URL in **Safari** on your iPhone. Tap **Share** → **Add to Home Screen**. Open PersonalOS from the home screen from now on.
2. **Sign in with Google**.
3. **Settings** → **Connect Gmail**. Google shows "Google hasn't verified this app": tap **Advanced** → **Go to PersonalOS (unsafe)**, tick the Gmail permission, and continue. ("Unsafe" here just means unverified; it's your own app.)
4. **Settings** → **Turn on notifications** → **Allow**. Then **Send a test**.
5. Capture a test note, e.g. "Joey scratching his ear again, vet said come back if it continues past Friday". It should come back filed under Joey and Health, with a follow-up due Friday.

## 6. Background job (Gmail every 15 minutes, 7am summary)

1. Open [`supabase/cron.sql`](supabase/cron.sql). Copy it into Supabase **SQL Editor**.
2. Replace `YOUR-APP-URL` with your app's address without `https://` (e.g. `personalos-xyz.vercel.app`) and `YOUR-CRON-SECRET` with your `CRON_SECRET` value. **Run**.
3. After 15 minutes, check it worked: run `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 3;`. Status should be `succeeded`. In the app, **Settings** → **Gmail** → **Last check** should update.

The 90-day Gmail import reads about 25 emails per run, so a few hundred emails take a few hours to work through. **Check now** in Settings speeds it up.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| "That Google account isn't on the list" | `ALLOWED_EMAILS` in Vercel doesn't match the account. Fix it and redeploy. |
| Sign-in loops back to the sign-in page | Supabase **Redirect URLs** is missing `https://YOUR-APP-URL/auth/callback`. |
| Google says `redirect_uri_mismatch` | The URI in the error isn't in your Google OAuth client's redirect URIs. Add it exactly. |
| Gmail says "access was revoked or expired" | The Google app is still in **Testing** (7-day expiry). Publish it (step 3.5), then **Reconnect** in Settings. |
| "Saved, but not filed" on every note | Anthropic key missing or out of credit, or you hit the monthly limit. Check Settings → AI spend and the Anthropic console. |
| No notifications | Open the app from the home screen icon, not Safari. iPhone needs iOS 16.4 or later. |

## Running it locally (optional, for development)

```
cp .env.example .env.local     # fill in values; APP_URL=http://localhost:3000
npm install
npm run dev
```

Add `http://localhost:3000/auth/callback` to Supabase redirect URLs and `http://localhost:3000/api/gmail/callback` to Google's. Checks: `npm run typecheck`, `npm run lint`, `npm test`.
