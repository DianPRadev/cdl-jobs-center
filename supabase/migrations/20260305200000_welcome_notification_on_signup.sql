-- Fix: email/password registration skips complete_onboarding, so no welcome
-- notification is created. Add notify_user call to handle_new_user for
-- non-onboarding users (role known at signup).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_role text;
  safe_role text;
  onboarding boolean;
  display_name text;
BEGIN
  raw_role := NEW.raw_user_meta_data ->> 'role';

  IF raw_role IN ('driver', 'company') THEN
    safe_role := raw_role;
    onboarding := false;
  ELSE
    safe_role := 'driver';
    onboarding := true;
  END IF;

  display_name := COALESCE(
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'full_name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, name, role, email, needs_onboarding)
  VALUES (NEW.id, display_name, safe_role, NEW.email, onboarding)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  WHERE public.profiles.email IS NULL;

  -- Send welcome notification for direct registration (non-onboarding).
  -- Onboarding users get their welcome notification from complete_onboarding.
  IF NOT onboarding THEN
    PERFORM public.notify_user(
      NEW.id,
      'welcome',
      'Welcome to CDL Jobs Center!',
      CASE WHEN safe_role = 'driver'
        THEN 'Your account is set up. Complete your profile to get AI-matched with the best CDL jobs.'
        ELSE 'Your account is set up. Post your first job to start receiving matched candidates.'
      END,
      jsonb_build_object(
        'link', CASE WHEN safe_role = 'driver'
          THEN '/driver-dashboard?tab=profile'
          ELSE '/dashboard?tab=jobs'
        END
      )
    );
  END IF;

  RETURN NEW;
END;
$$;
