-- Checks that row level security isolates owners. Run after the shim and migrations.
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'raj@example.com'),
                               ('22222222-2222-2222-2222-222222222222', 'other@example.com');
insert into public.subjects (owner_id, name, kind) values
  ('11111111-1111-1111-1111-111111111111', 'Joey', 'pet'),
  ('22222222-2222-2222-2222-222222222222', 'Rex', 'pet');
insert into public.gmail_accounts (owner_id, email, refresh_token_enc)
  values ('11111111-1111-1111-1111-111111111111', 'raj@example.com', 'secret');
insert into public.gmail_queue (owner_id, message_id) values
  ('11111111-1111-1111-1111-111111111111', 'm1'),
  ('11111111-1111-1111-1111-111111111111', 'm2'),
  ('11111111-1111-1111-1111-111111111111', 'm3');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
do $$ begin
  if (select count(*) from public.subjects) <> 1 then raise exception 'owner should see exactly 1 subject'; end if;
  if (select name from public.subjects) <> 'Joey' then raise exception 'owner sees wrong subject'; end if;
end $$;
-- Writing a row for someone else must fail.
do $$ begin
  begin
    insert into public.subjects (owner_id, name) values ('22222222-2222-2222-2222-222222222222', 'Sneaky');
    raise exception 'insert for another owner should have failed';
  exception when insufficient_privilege then null;
  end;
end $$;
-- Status columns are readable, the token is not.
select email, backfill_status from public.gmail_accounts;
do $$ begin
  begin
    perform refresh_token_enc from public.gmail_accounts;
    raise exception 'token column should not be readable';
  exception when insufficient_privilege then null;
  end;
end $$;
-- The queue claim function is for server jobs only.
do $$ begin
  begin
    perform public.claim_gmail_queue('11111111-1111-1111-1111-111111111111', 2);
    raise exception 'claim function should not be callable by users';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
set local role service_role;
do $$ begin
  if (select count(*) from public.claim_gmail_queue('11111111-1111-1111-1111-111111111111', 2)) <> 2 then
    raise exception 'claim should return 2 rows'; end if;
  if (select count(*) from public.claim_gmail_queue('11111111-1111-1111-1111-111111111111', 5)) <> 1 then
    raise exception 'second claim should return the remaining row'; end if;
end $$;
rollback;

select 'RLS tests passed' as result;
