-- Fix: save address and website from sign-up metadata into company_profiles
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
  meta jsonb;
BEGIN
  meta := NEW.raw_user_meta_data;
  raw_role := meta ->> 'role';

  IF raw_role IN ('driver', 'company') THEN
    safe_role := raw_role;
    onboarding := false;
  ELSE
    safe_role := 'driver';
    onboarding := true;
  END IF;

  display_name := COALESCE(
    meta ->> 'name',
    meta ->> 'full_name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, name, role, email, needs_onboarding)
  VALUES (NEW.id, display_name, safe_role, NEW.email, onboarding)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  WHERE public.profiles.email IS NULL;

  IF NOT onboarding THEN
    IF safe_role = 'driver' THEN
      INSERT INTO public.driver_profiles (
        id, first_name, last_name, phone, zip_code,
        license_class, years_exp, license_state, interested_in
      )
      VALUES (
        NEW.id,
        COALESCE(NULLIF(TRIM(meta ->> 'first_name'), ''), split_part(display_name, ' ', 1)),
        COALESCE(NULLIF(TRIM(meta ->> 'last_name'), ''),
          CASE WHEN position(' ' IN display_name) > 0
               THEN substring(display_name FROM position(' ' IN display_name) + 1)
               ELSE ''
          END
        ),
        COALESCE(NULLIF(TRIM(meta ->> 'phone'), ''), ''),
        NULLIF(TRIM(COALESCE(meta ->> 'zip_code', '')), ''),
        NULLIF(TRIM(COALESCE(meta ->> 'license_class', '')), ''),
        CASE WHEN (meta ->> 'years_exp') ~ '^\d+$' THEN (meta ->> 'years_exp')::integer ELSE NULL END,
        NULLIF(TRIM(COALESCE(meta ->> 'license_state', '')), ''),
        NULLIF(TRIM(COALESCE(meta ->> 'interested_in', '')), '')
      )
      ON CONFLICT (id) DO NOTHING;
    ELSE
      INSERT INTO public.company_profiles (id, company_name, email, contact_name, phone, address, website)
      VALUES (
        NEW.id,
        COALESCE(NULLIF(TRIM(meta ->> 'company_name'), ''), ''),
        NEW.email,
        COALESCE(NULLIF(TRIM(meta ->> 'contact_name'), ''), display_name),
        COALESCE(NULLIF(TRIM(meta ->> 'phone'), ''), ''),
        COALESCE(NULLIF(TRIM(meta ->> 'company_address'), ''), NULLIF(TRIM(meta ->> 'address'), ''), ''),
        COALESCE(NULLIF(TRIM(meta ->> 'website'), ''), '')
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;

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
