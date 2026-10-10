# PersonalOS

A private web app that turns scattered notes, photos and Gmail into one household record. It files everything by who it's about and area, shows what's due today, and writes a brief before an appointment.

- **Plan and design:** [`docs/blueprint.html`](docs/blueprint.html) (PRD, architecture, screens)
- **Setting it up:** [`SETUP.md`](SETUP.md)

## How it works

| Part | Where |
|---|---|
| Screens: Today, Browse, Capture, Ask, Settings | `src/app/(app)/` |
| Data access (every query scoped to the owner) | `src/lib/store.ts` |
| Database schema and row level security | `supabase/migrations/` |
| AI filing of notes, photos, emails (Claude Haiku 5.5, Sonnet 5.5 retry for unclear photos) | `src/lib/ai/extract.ts`, `src/lib/ai/file.ts` |
| Ask and briefs (Haiku plans the filter, Sonnet 5.5 writes the answer with citations) | `src/lib/ai/ask.ts`, `src/lib/ai/answer.ts` |
| Gmail: free filters, 90-day import, change history sync | `src/lib/gmail/` |
| Today rules (overdue, due today, waiting on, snooze) | `src/lib/followups.ts` |
| Background job: Gmail every 15 min, 7am push | `src/lib/jobs.ts`, `src/app/api/cron/tick/route.ts`, `supabase/cron.sql` |
| Push notifications (home-screen web app) | `src/lib/push.ts`, `public/sw.js` |

## Checks

```
npm run typecheck
npm run lint
npm test
```

`npm test` runs the unit tests. The Gmail sync integration test (`tests/gmail-sync.integration.test.ts`) and the row level security test (`supabase/tests/rls_test.sql`) need a Postgres database; they're skipped otherwise.

## Changes from the blueprint

| Blueprint said | Built | Why |
|---|---|---|
| 90-day backfill through the Batch API | Read gradually, 25 emails per 15-minute run | The Batch API would save about 7 cents in total, and it needs a separate polling flow. Not worth the extra moving parts. |
| Skip emails with an unsubscribe header | Skip promotions, social, forums, mailing lists, bulk mail and sign-in codes; keep the rest | Bills and insurers often send with an unsubscribe header. Skipping them would miss exactly the emails that matter. |
| "Re-check past items" with AI after adding someone new | Keyword search with a tick list, no AI | Free, instant and you can see what's being tagged. |
| Prompt caching on fixed instructions | Not used | Our instructions are shorter than the minimum length Anthropic caches, so it would do nothing. Costs stay low anyway. |
| Gmail backfill items go to "New from Gmail" | Backfill items are filed directly. Promises more than 30 days past due are kept on the item but not shown on Today | Reviewing 90 days of email one by one would be a chore, and old promises would flood Today. New mail still waits for Keep or Dismiss. |
