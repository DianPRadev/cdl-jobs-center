-- =============================================================
-- Fix match-recompute cron config source
-- Use app_config table values (already populated) instead of app.settings.*
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  v_job_id INT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'match-recompute-queue';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'match-recompute-queue',
    '*/5 * * * *',
    $cmd$
    WITH cfg AS (
      SELECT
        NULLIF(MAX(CASE WHEN key = 'supabase_url' THEN value END), '') AS supabase_url,
        NULLIF(MAX(CASE WHEN key = 'service_role_key' THEN value END), '') AS service_key
      FROM public.app_config
    )
    SELECT net.http_post(
      url := cfg.supabase_url || '/functions/v1/match-recompute',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || cfg.service_key,
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    )
    FROM cfg
    WHERE cfg.supabase_url IS NOT NULL
      AND cfg.service_key IS NOT NULL;
    $cmd$
  );
END;
$$;
