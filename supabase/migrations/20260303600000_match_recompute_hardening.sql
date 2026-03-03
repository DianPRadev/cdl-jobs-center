-- =============================================================
-- AI Matching hardening (company scope)
-- - Fix company match notification deep-link
-- - Enqueue recompute on DELETE and company ownership changes
-- - Replace hardcoded recompute cron URL/token with dynamic settings
-- =============================================================

-- 1) Company match notifications should deep-link to the AI Matches tab.
CREATE OR REPLACE FUNCTION trg_notify_company_match()
RETURNS TRIGGER AS $$
DECLARE
  v_job_title TEXT;
  v_recent BOOLEAN;
BEGIN
  IF NEW.overall_score < 50 THEN RETURN NEW; END IF;

  -- 1-hour debounce per company
  SELECT EXISTS(
    SELECT 1 FROM notifications
    WHERE user_id = NEW.company_id
      AND type = 'new_match'
      AND created_at > now() - interval '1 hour'
  ) INTO v_recent;

  IF v_recent THEN RETURN NEW; END IF;

  SELECT title INTO v_job_title FROM jobs WHERE id = NEW.job_id;

  PERFORM notify_user(
    NEW.company_id,
    'new_match',
    'New Candidate Match',
    'A candidate matched ' || NEW.overall_score || '% for "' || COALESCE(v_job_title, 'a job') || '"',
    jsonb_build_object(
      'job_id', NEW.job_id,
      'score', NEW.overall_score,
      'job_title', v_job_title,
      'link', '/dashboard?tab=ai-matches'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Best-effort backfill for existing company notifications created with old tab key.
UPDATE notifications
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{link}', to_jsonb('/dashboard?tab=ai-matches'::text), true)
WHERE type = 'new_match'
  AND metadata->>'link' = '/dashboard?tab=matches';

-- 2) Recompute queue trigger must react to DELETE and company ownership changes
-- so stale company rows are purged on the next recompute pass.
CREATE OR REPLACE FUNCTION enqueue_match_recompute()
RETURNS TRIGGER AS $$
DECLARE
  v_entity_id UUID;
  v_company_id UUID;
  v_reason TEXT;
BEGIN
  v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  IF TG_OP = 'INSERT' THEN
    v_reason := TG_TABLE_NAME || '_created';
  ELSIF TG_OP = 'UPDATE' THEN
    v_reason := TG_TABLE_NAME || '_updated';
  ELSE
    v_reason := TG_TABLE_NAME || '_deleted';
  END IF;

  IF TG_TABLE_NAME = 'driver_profiles' THEN
    INSERT INTO matching_recompute_queue (entity_type, entity_id, reason)
    VALUES ('driver_profile', v_entity_id, v_reason)
    ON CONFLICT DO NOTHING;

  ELSIF TG_TABLE_NAME = 'jobs' THEN
    v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;

    INSERT INTO matching_recompute_queue (entity_type, entity_id, company_id, reason)
    VALUES ('job', v_entity_id, v_company_id, v_reason)
    ON CONFLICT DO NOTHING;

    IF TG_OP = 'UPDATE' AND OLD.company_id IS DISTINCT FROM NEW.company_id AND OLD.company_id IS NOT NULL THEN
      INSERT INTO matching_recompute_queue (entity_type, entity_id, company_id, reason)
      VALUES ('job', OLD.id, OLD.company_id, 'job_company_changed_old_scope')
      ON CONFLICT DO NOTHING;
    END IF;

  ELSIF TG_TABLE_NAME = 'applications' THEN
    v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;

    INSERT INTO matching_recompute_queue (entity_type, entity_id, company_id, reason)
    VALUES ('application', v_entity_id, v_company_id, v_reason)
    ON CONFLICT DO NOTHING;

    IF TG_OP = 'UPDATE' AND OLD.company_id IS DISTINCT FROM NEW.company_id AND OLD.company_id IS NOT NULL THEN
      INSERT INTO matching_recompute_queue (entity_type, entity_id, company_id, reason)
      VALUES ('application', OLD.id, OLD.company_id, 'application_company_changed_old_scope')
      ON CONFLICT DO NOTHING;
    END IF;

  ELSIF TG_TABLE_NAME = 'leads' THEN
    v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;

    INSERT INTO matching_recompute_queue (entity_type, entity_id, company_id, reason)
    VALUES ('lead', v_entity_id, v_company_id, v_reason)
    ON CONFLICT DO NOTHING;

    IF TG_OP = 'UPDATE' AND OLD.company_id IS DISTINCT FROM NEW.company_id AND OLD.company_id IS NOT NULL THEN
      INSERT INTO matching_recompute_queue (entity_type, entity_id, company_id, reason)
      VALUES ('lead', OLD.id, OLD.company_id, 'lead_company_changed_old_scope')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_job_match ON jobs;
CREATE TRIGGER trg_job_match
  AFTER INSERT OR UPDATE OR DELETE ON jobs
  FOR EACH ROW EXECUTE FUNCTION enqueue_match_recompute();

DROP TRIGGER IF EXISTS trg_application_match ON applications;
CREATE TRIGGER trg_application_match
  AFTER INSERT OR UPDATE OR DELETE ON applications
  FOR EACH ROW EXECUTE FUNCTION enqueue_match_recompute();

DROP TRIGGER IF EXISTS trg_lead_match ON leads;
CREATE TRIGGER trg_lead_match
  AFTER INSERT OR UPDATE OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION enqueue_match_recompute();

-- 3) Replace hardcoded cron target/token with project settings.
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
        NULLIF(current_setting('app.settings.supabase_url', true), '') AS supabase_url,
        NULLIF(current_setting('app.settings.service_role_key', true), '') AS service_key
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
