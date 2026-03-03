-- Fix: email notifications not delivered because notify_user() couldn't reach
-- the Edge Function. Two root causes:
--   1. pg_net extension not enabled
--   2. app.settings.supabase_url not set as a database GUC variable
--
-- Also fixes welcome notification for OAuth users: defer until after onboarding
-- so the email contains the correct role-specific content.

-- ── 1. pg_net is already enabled on this project ────────────────────────────

-- ── 2. MANUAL STEP (run in Supabase SQL Editor, not migrations): ────────────
-- These settings let notify_user() call the Edge Function for email delivery.
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://ivgfgdyfafuqusrdxzij.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = '<YOUR_SERVICE_ROLE_KEY>';

-- ── 3. Fix welcome trigger: skip users who need onboarding ──────────────────
-- OAuth users go through onboarding to pick their role. The welcome notification
-- should be sent AFTER they choose, not before (when role is still the default).
CREATE OR REPLACE FUNCTION trg_notify_welcome()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip welcome for OAuth users who haven't picked their role yet.
  -- complete_onboarding() will send their welcome notification instead.
  IF NEW.needs_onboarding = true THEN
    RETURN NEW;
  END IF;

  PERFORM notify_user(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Update complete_onboarding to send welcome notification ──────────────
CREATE OR REPLACE FUNCTION public.complete_onboarding(chosen_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Get user info from auth.users
  SELECT email,
         COALESCE(raw_user_meta_data ->> 'name', raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
    INTO user_email, full_name
    FROM auth.users
   WHERE id = uid;

  display_name := COALESCE(full_name, 'User');

  -- Update profiles row (created by handle_new_user trigger)
  UPDATE profiles
     SET role = chosen_role,
         needs_onboarding = false,
         name = display_name
   WHERE id = uid;

  -- If no profiles row exists yet, create it
  IF NOT FOUND THEN
    INSERT INTO profiles (id, name, role, needs_onboarding)
    VALUES (uid, display_name, chosen_role, false)
    ON CONFLICT (id) DO UPDATE
      SET role = EXCLUDED.role,
          needs_onboarding = false,
          name = EXCLUDED.name;
  END IF;

  -- Create extended profile row
  IF chosen_role = 'driver' THEN
    INSERT INTO driver_profiles (id, first_name, last_name)
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
    INSERT INTO company_profiles (id, company_name, email, contact_name)
    VALUES (uid, '', user_email, display_name)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Send welcome notification now that the user has chosen their role
  PERFORM notify_user(
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
