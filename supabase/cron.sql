-- Schedules the background job (Gmail check every 15 minutes, 7am summary).
-- Before running: replace YOUR-APP-URL and YOUR-CRON-SECRET with your real values. See SETUP.md, step 6.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'personalos-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP-URL/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR-CRON-SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- To check it's running:   select * from cron.job_run_details order by start_time desc limit 5;
-- To remove it:            select cron.unschedule('personalos-tick');
