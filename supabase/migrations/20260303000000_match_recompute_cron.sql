-- =============================================================
-- Schedule match-recompute via pg_cron + pg_net
-- Runs every 5 minutes to process pending queue items
-- =============================================================

-- Enable required extensions (already available on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule the cron job to call match-recompute every 5 minutes
SELECT cron.schedule(
  'match-recompute-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dlhtuqsdooltinqmyrgw.supabase.co/functions/v1/match-recompute',
    headers := '{"Authorization": "Bearer match-recompute-cron-secret-2026", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Daily cleanup of old completed queue items (> 7 days old)
SELECT cron.schedule(
  'match-queue-cleanup',
  '0 3 * * *',
  $$
  DELETE FROM matching_recompute_queue
  WHERE status IN ('done', 'error')
    AND completed_at < now() - interval '7 days';
  $$
);
