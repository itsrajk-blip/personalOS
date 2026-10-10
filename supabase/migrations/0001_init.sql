-- PersonalOS schema. Every table carries owner_id so more household members can be added later.
-- Row level security limits each signed-in user to their own rows. Server jobs use the secret key, which bypasses RLS.

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'person' check (kind in ('person', 'pet', 'home', 'vehicle', 'place', 'other')),
  colour text not null default 'slate',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('text', 'photo', 'gmail')),
  original_text text,
  photo_path text,
  gmail_message_id text,
  gmail_thread_id text,
  email_from text,
  email_subject text,
  summary text,
  happened_on date,
  -- processing: saved, AI not finished. ready: filed. review: found in Gmail, waiting for keep or dismiss.
  -- dismissed: dismissed from review. failed: AI could not process it, original still kept.
  status text not null default 'processing' check (status in ('processing', 'ready', 'review', 'dismissed', 'failed')),
  needs_check boolean not null default false,
  ai_model text,
  created_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('english', coalesce(original_text, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(email_subject, ''))
  ) stored,
  unique (owner_id, gmail_message_id)
);
create index items_owner_date on public.items (owner_id, happened_on desc, created_at desc);
create index items_owner_status on public.items (owner_id, status);
create index items_search on public.items using gin (search);
create index items_thread on public.items (owner_id, gmail_thread_id);

create table public.item_subjects (
  item_id uuid not null references public.items (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  set_by text not null default 'ai' check (set_by in ('ai', 'user')),
  primary key (item_id, subject_id)
);
create index item_subjects_subject on public.item_subjects (subject_id);

create table public.item_areas (
  item_id uuid not null references public.items (id) on delete cascade,
  area_id uuid not null references public.areas (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  set_by text not null default 'ai' check (set_by in ('ai', 'user')),
  primary key (item_id, area_id)
);
create index item_areas_area on public.item_areas (area_id);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  title text not null,
  direction text not null check (direction in ('on_me', 'waiting_on_them')),
  due_date date,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  snoozed_until date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index followups_owner_open on public.followups (owner_id, status, due_date);
create index followups_item on public.followups (item_id);

create table public.subject_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'other',
  mentions int not null default 1,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'ignored')),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.gmail_accounts (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  refresh_token_enc text not null,
  history_id text,
  backfill_status text not null default 'pending' check (backfill_status in ('pending', 'running', 'done')),
  backfill_page_token text,
  last_sync_at timestamptz,
  last_error text,
  connected_at timestamptz not null default now()
);

create table public.gmail_queue (
  owner_id uuid not null references auth.users (id) on delete cascade,
  message_id text not null,
  from_backfill boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'skipped', 'failed')),
  attempts int not null default 0,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (owner_id, message_id)
);
create index gmail_queue_pending on public.gmail_queue (owner_id, status, created_at);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  purpose text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_owner_month on public.ai_usage (owner_id, created_at);

create table public.app_state (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'Australia/Melbourne',
  last_morning_push date,
  seeded boolean not null default false
);

-- Row level security: owners see and change only their own rows.
-- Enabled with one plain statement per table so the Supabase SQL editor's check can see it.
alter table public.subjects enable row level security;
alter table public.areas enable row level security;
alter table public.items enable row level security;
alter table public.item_subjects enable row level security;
alter table public.item_areas enable row level security;
alter table public.followups enable row level security;
alter table public.subject_suggestions enable row level security;
alter table public.gmail_accounts enable row level security;
alter table public.gmail_queue enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.app_state enable row level security;

do $$
declare t text;
begin
  foreach t in array array['subjects', 'areas', 'items', 'item_subjects', 'item_areas', 'followups',
                           'subject_suggestions', 'gmail_accounts', 'gmail_queue', 'push_subscriptions',
                           'ai_usage', 'app_state']
  loop
    execute format(
      'create policy "owner access" on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t);
  end loop;
end $$;

-- The encrypted Gmail token is only ever read by server code with the secret key.
-- Signed-in users can see the connection status columns, nothing else.
revoke all on public.gmail_accounts from anon, authenticated;
grant select (owner_id, email, history_id, backfill_status, backfill_page_token, last_sync_at, last_error, connected_at)
  on public.gmail_accounts to authenticated;

-- Claims a batch of queued Gmail messages for one worker run. Rows stuck in processing for 10 minutes are retried.
create or replace function public.claim_gmail_queue(p_owner uuid, p_limit int)
returns setof public.gmail_queue
language sql
as $$
  update public.gmail_queue q
     set status = 'processing', claimed_at = now(), attempts = q.attempts + 1
   where (q.owner_id, q.message_id) in (
     select owner_id, message_id from public.gmail_queue
      where owner_id = p_owner
        and attempts < 3
        and (status = 'pending' or (status = 'processing' and claimed_at < now() - interval '10 minutes'))
      order by created_at
      limit p_limit
      for update skip locked)
  returning q.*;
$$;
revoke execute on function public.claim_gmail_queue(uuid, int) from public, anon, authenticated;
