-- ============================================================================
-- Fix: Schema-qualify all table/function references in function bodies.
-- Migration 20260304110000 set search_path='' on all functions, but the
-- function bodies still use unqualified names like 'notifications' instead
-- of 'public.notifications'. This breaks them at runtime.
-- ============================================================================

-- ===================== notify_user =====================
-- Latest version from 20260303500000 (reads config from app_config)

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id    UUID,
  p_type       public.notification_type,
  p_title      TEXT,
  p_body       TEXT DEFAULT '',
  p_metadata   JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_notif_id UUID;
  v_edge_url TEXT;
  v_service_key TEXT;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.notifications (user_id, type, title, body, metadata)
  VALUES (p_user_id, p_type, p_title, p_body, p_metadata)
  RETURNING id INTO v_notif_id;

  BEGIN
    SELECT value INTO v_edge_url FROM public.app_config WHERE key = 'supabase_url';
    SELECT value INTO v_service_key FROM public.app_config WHERE key = 'service_role_key';

    IF v_edge_url IS NOT NULL AND v_edge_url != ''
       AND v_service_key IS NOT NULL AND v_service_key != '' THEN
      PERFORM net.http_post(
        url    := v_edge_url || '/functions/v1/send-notification',
        body   := jsonb_build_object(
          'notification_id', v_notif_id,
          'user_id', p_user_id,
          'type', p_type::text,
          'title', p_title,
          'body', p_body,
          'metadata', p_metadata
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_notif_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== mark_notifications_read =====================

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_notif_ids UUID[])
RETURNS VOID AS $$
BEGIN
  UPDATE public.notifications
  SET read = TRUE
  WHERE id = ANY(p_notif_ids)
    AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== mark_all_notifications_read =====================

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS VOID AS $$
BEGIN
  UPDATE public.notifications
  SET read = TRUE
  WHERE user_id = auth.uid()
    AND read = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== clear_all_notifications =====================

CREATE OR REPLACE FUNCTION public.clear_all_notifications()
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== trg_notify_new_application =====================
-- Latest version from 20260302200000

CREATE OR REPLACE FUNCTION public.trg_notify_new_application()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.notify_user(
    NEW.company_id,
    'new_application',
    'New Application Received',
    COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '') ||
      ' applied for ' || COALESCE(NEW.job_title, 'a position'),
    jsonb_build_object(
      'application_id', NEW.id,
      'driver_name', COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''),
      'job_title', NEW.job_title,
      'link', '/dashboard?tab=applications'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== trg_notify_stage_change =====================

CREATE OR REPLACE FUNCTION public.trg_notify_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage THEN
    PERFORM public.notify_user(
      NEW.driver_id,
      'stage_change',
      'Application Status Updated',
      'Your application for ' || COALESCE(NEW.job_title, 'a position') ||
        ' at ' || COALESCE(NEW.company_name, 'a company') ||
        ' moved to "' || NEW.pipeline_stage || '"',
      jsonb_build_object(
        'application_id', NEW.id,
        'old_stage', OLD.pipeline_stage,
        'new_stage', NEW.pipeline_stage,
        'job_title', NEW.job_title,
        'company_name', NEW.company_name,
        'link', '/driver-dashboard?tab=applications'
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== trg_notify_new_message =====================

CREATE OR REPLACE FUNCTION public.trg_notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
  v_app RECORD;
  v_recipient_id UUID;
  v_sender_name TEXT;
  v_recent_notif_exists BOOLEAN;
BEGIN
  SELECT driver_id, company_id, job_title, first_name, last_name, company_name
  INTO v_app
  FROM public.applications WHERE id = NEW.application_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.sender_role = 'driver' THEN
    v_recipient_id := v_app.company_id;
    v_sender_name := COALESCE(v_app.first_name, '') || ' ' || COALESCE(v_app.last_name, '');
  ELSE
    v_recipient_id := v_app.driver_id;
    v_sender_name := COALESCE(v_app.company_name, 'Company');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.notifications
    WHERE user_id = v_recipient_id
      AND type = 'new_message'
      AND metadata->>'application_id' = NEW.application_id::text
      AND created_at > now() - interval '5 minutes'
  ) INTO v_recent_notif_exists;

  IF v_recent_notif_exists THEN RETURN NEW; END IF;

  PERFORM public.notify_user(
    v_recipient_id,
    'new_message',
    'New Message from ' || TRIM(v_sender_name),
    LEFT(NEW.body, 100),
    jsonb_build_object(
      'application_id', NEW.application_id,
      'sender_name', TRIM(v_sender_name),
      'link', CASE WHEN NEW.sender_role = 'driver'
        THEN '/dashboard?tab=messages&app=' || NEW.application_id
        ELSE '/driver-dashboard?tab=messages&app=' || NEW.application_id
      END
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== trg_notify_driver_match =====================

CREATE OR REPLACE FUNCTION public.trg_notify_driver_match()
RETURNS TRIGGER AS $$
DECLARE
  v_job_title TEXT;
  v_recent BOOLEAN;
BEGIN
  IF NEW.overall_score < 50 THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.driver_id
      AND type = 'new_match'
      AND created_at > now() - interval '1 hour'
  ) INTO v_recent;

  IF v_recent THEN RETURN NEW; END IF;

  SELECT title INTO v_job_title FROM public.jobs WHERE id = NEW.job_id;

  PERFORM public.notify_user(
    NEW.driver_id,
    'new_match',
    'New Job Match Found',
    'You matched ' || NEW.overall_score || '% with "' || COALESCE(v_job_title, 'a job') || '"',
    jsonb_build_object(
      'job_id', NEW.job_id,
      'score', NEW.overall_score,
      'job_title', v_job_title,
      'link', '/driver-dashboard?tab=matches'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== trg_notify_company_match =====================
-- Latest version from 20260303600000 (deep-link to ai-matches tab)

CREATE OR REPLACE FUNCTION public.trg_notify_company_match()
RETURNS TRIGGER AS $$
DECLARE
  v_job_title TEXT;
  v_recent BOOLEAN;
BEGIN
  IF NEW.overall_score < 50 THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.company_id
      AND type = 'new_match'
      AND created_at > now() - interval '1 hour'
  ) INTO v_recent;

  IF v_recent THEN RETURN NEW; END IF;

  SELECT title INTO v_job_title FROM public.jobs WHERE id = NEW.job_id;

  PERFORM public.notify_user(
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== trg_notify_new_lead =====================
-- Latest version from 20260302100000

CREATE OR REPLACE FUNCTION public.trg_notify_new_lead()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_lead_name TEXT;
BEGIN
  v_company_id := NEW.company_id;
  v_lead_name := COALESCE(NEW.full_name, 'Someone');

  PERFORM public.notify_user(
    v_company_id,
    'new_lead',
    'New Lead Received',
    v_lead_name || ' is interested in your company',
    jsonb_build_object(
      'lead_id', NEW.id,
      'lead_name', v_lead_name,
      'link', '/dashboard?tab=leads'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== trg_notify_verification_update =====================

CREATE OR REPLACE FUNCTION public.trg_notify_verification_update()
RETURNS TRIGGER AS $$
DECLARE
  v_company_name TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF OLD.status != 'pending' THEN RETURN NEW; END IF;

  SELECT company_name INTO v_company_name
  FROM public.company_profiles WHERE id = NEW.company_id;

  IF NEW.status = 'approved' THEN
    PERFORM public.notify_user(
      NEW.company_id,
      'verification_update',
      'Verification Approved',
      'Your company has been verified! A verified badge is now visible on your profile and job listings.',
      jsonb_build_object(
        'decision', 'approved',
        'company_name', COALESCE(v_company_name, ''),
        'link', '/dashboard'
      )
    );
  ELSIF NEW.status = 'rejected' THEN
    PERFORM public.notify_user(
      NEW.company_id,
      'verification_update',
      'Verification Not Approved',
      'Your verification request was not approved.' ||
        CASE WHEN NEW.rejection_reason IS NOT NULL AND NEW.rejection_reason != ''
          THEN ' Reason: ' || NEW.rejection_reason
          ELSE ''
        END,
      jsonb_build_object(
        'decision', 'rejected',
        'rejection_reason', COALESCE(NEW.rejection_reason, ''),
        'company_name', COALESCE(v_company_name, ''),
        'link', '/verification'
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== trg_notify_welcome =====================
-- Latest version from 20260303400000

CREATE OR REPLACE FUNCTION public.trg_notify_welcome()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.needs_onboarding = true THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_user(
    NEW.id,
    'welcome',
    'Welcome to CDL Jobs Center!',
    CASE WHEN NEW.role = 'driver'
      THEN 'Your account is set up. Complete your profile to get AI-matched with the best CDL jobs.'
      ELSE 'Your account is set up. Post your first job to start receiving matched candidates.'
    END,
    jsonb_build_object(
      'link', CASE WHEN NEW.role = 'driver'
        THEN '/driver-dashboard?tab=profile'
        ELSE '/dashboard?tab=post-job'
      END
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== enqueue_match_recompute =====================
-- Latest version from 20260303600000 (handles DELETE + company ownership changes)

CREATE OR REPLACE FUNCTION public.enqueue_match_recompute()
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
    INSERT INTO public.matching_recompute_queue (entity_type, entity_id, reason)
    VALUES ('driver_profile', v_entity_id, v_reason)
    ON CONFLICT DO NOTHING;

  ELSIF TG_TABLE_NAME = 'jobs' THEN
    v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;

    INSERT INTO public.matching_recompute_queue (entity_type, entity_id, company_id, reason)
    VALUES ('job', v_entity_id, v_company_id, v_reason)
    ON CONFLICT DO NOTHING;

    IF TG_OP = 'UPDATE' AND OLD.company_id IS DISTINCT FROM NEW.company_id AND OLD.company_id IS NOT NULL THEN
      INSERT INTO public.matching_recompute_queue (entity_type, entity_id, company_id, reason)
      VALUES ('job', OLD.id, OLD.company_id, 'job_company_changed_old_scope')
      ON CONFLICT DO NOTHING;
    END IF;

  ELSIF TG_TABLE_NAME = 'applications' THEN
    v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;

    INSERT INTO public.matching_recompute_queue (entity_type, entity_id, company_id, reason)
    VALUES ('application', v_entity_id, v_company_id, v_reason)
    ON CONFLICT DO NOTHING;

    IF TG_OP = 'UPDATE' AND OLD.company_id IS DISTINCT FROM NEW.company_id AND OLD.company_id IS NOT NULL THEN
      INSERT INTO public.matching_recompute_queue (entity_type, entity_id, company_id, reason)
      VALUES ('application', OLD.id, OLD.company_id, 'application_company_changed_old_scope')
      ON CONFLICT DO NOTHING;
    END IF;

  ELSIF TG_TABLE_NAME = 'leads' THEN
    v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;

    INSERT INTO public.matching_recompute_queue (entity_type, entity_id, company_id, reason)
    VALUES ('lead', v_entity_id, v_company_id, v_reason)
    ON CONFLICT DO NOTHING;

    IF TG_OP = 'UPDATE' AND OLD.company_id IS DISTINCT FROM NEW.company_id AND OLD.company_id IS NOT NULL THEN
      INSERT INTO public.matching_recompute_queue (entity_type, entity_id, company_id, reason)
      VALUES ('lead', OLD.id, OLD.company_id, 'lead_company_changed_old_scope')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== claim_recompute_batch =====================
-- SQL language function

CREATE OR REPLACE FUNCTION public.claim_recompute_batch(batch_size INT DEFAULT 20)
RETURNS SETOF public.matching_recompute_queue AS $$
  UPDATE public.matching_recompute_queue
  SET status = 'processing',
      started_at = now(),
      attempts = attempts + 1
  WHERE id IN (
    SELECT id
    FROM public.matching_recompute_queue
    WHERE status = 'pending'
      AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '';

-- ===================== enqueue_driver_feedback_recompute =====================

CREATE OR REPLACE FUNCTION public.enqueue_driver_feedback_recompute()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.matching_recompute_queue (entity_type, entity_id, reason)
  VALUES ('driver_profile', NEW.driver_id, 'feedback_updated')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===================== complete_onboarding =====================
-- Has SET search_path = public but calls notify_user() which needs public. prefix
-- Rewrite with search_path = '' and fully qualified references

CREATE OR REPLACE FUNCTION public.complete_onboarding(chosen_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  display_name text;
  user_email text;
  full_name text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF chosen_role NOT IN ('driver', 'company') THEN
    RAISE EXCEPTION 'Invalid role: %', chosen_role;
  END IF;

  SELECT email,
         COALESCE(raw_user_meta_data ->> 'name', raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
    INTO user_email, full_name
    FROM auth.users
   WHERE id = uid;

  display_name := COALESCE(full_name, 'User');

  UPDATE public.profiles
     SET role = chosen_role,
         needs_onboarding = false,
         name = display_name
   WHERE id = uid;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, name, role, needs_onboarding)
    VALUES (uid, display_name, chosen_role, false)
    ON CONFLICT (id) DO UPDATE
      SET role = EXCLUDED.role,
          needs_onboarding = false,
          name = EXCLUDED.name;
  END IF;

  IF chosen_role = 'driver' THEN
    INSERT INTO public.driver_profiles (id, first_name, last_name)
    VALUES (
      uid,
      split_part(display_name, ' ', 1),
      CASE WHEN position(' ' IN display_name) > 0
           THEN substring(display_name FROM position(' ' IN display_name) + 1)
           ELSE ''
      END
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.company_profiles (id, company_name, email, contact_name)
    VALUES (uid, '', user_email, display_name)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  PERFORM public.notify_user(
    uid,
    'welcome',
    'Welcome to CDL Jobs Center!',
    CASE WHEN chosen_role = 'driver'
      THEN 'Your account is set up. Complete your profile to get AI-matched with the best CDL jobs.'
      ELSE 'Your account is set up. Post your first job to start receiving matched candidates.'
    END,
    jsonb_build_object(
      'link', CASE WHEN chosen_role = 'driver'
        THEN '/driver-dashboard?tab=profile'
        ELSE '/dashboard?tab=post-job'
      END
    )
  );
END;
$$;
