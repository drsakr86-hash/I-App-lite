-- NOT APPLIED. Schedules the worker every minute. Requires pg_cron, pg_net and supabase_vault (all already installed in this project).
-- Step 1 (once, by an admin, value typed in the SQL editor - never committed):
--   select vault.create_secret('<WORKER_SECRET value>', 'wa_worker_secret');
-- Step 2: replace <PROJECT_REF> below, then run.
select cron.schedule('wa-worker', '* * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/quick-task',
    headers := jsonb_build_object('x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'wa_worker_secret')),
    timeout_milliseconds := 55000);
$$);
-- Rollback: select cron.unschedule('wa-worker');
