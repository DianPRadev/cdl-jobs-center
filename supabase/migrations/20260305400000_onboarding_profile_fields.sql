-- ============================================================
-- Update complete_onboarding to accept profile fields
-- Adds profile_data JSONB parameter so OAuth users can supply
-- required fields (name, phone, company_name) during onboarding.
-- ============================================================

-- Drop old single-arg version and recreate with profile_data param
DROP FUNCTION IF EXISTS public.complete_onboarding(text);

CREATE OR REPLACE FUNCTION public.complete_onboarding(
  chosen_role text,
  profile_data jsonb DEFAULT '{}'::jsonb
)
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
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_company_name text;
  v_contact_name text;
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

  -- Extract profile fields from the JSON parameter
  v_first_name  := NULLIF(TRIM(profile_data ->> 'first_name'), '');
  v_last_name   := NULLIF(TRIM(profile_data ->> 'last_name'), '');
  v_phone       := NULLIF(TRIM(profile_data ->> 'phone'), '');
  v_company_name := NULLIF(TRIM(profile_data ->> 'company_name'), '');
  v_contact_name := NULLIF(TRIM(profile_data ->> 'contact_name'), '');

  -- Build display name from profile data or fall back to OAuth metadata
  IF chosen_role = 'driver' AND v_first_name IS NOT NULL THEN
    display_name := TRIM(COALESCE(v_first_name, '') || ' ' || COALESCE(v_last_name, ''));
  ELSIF chosen_role = 'company' AND v_contact_name IS NOT NULL THEN
    display_name := v_contact_name;
  ELSE
    display_name := COALESCE(full_name, 'User');
  END IF;

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
    INSERT INTO public.driver_profiles (id, first_name, last_name, phone)
    VALUES (
      uid,
      COALESCE(v_first_name, split_part(display_name, ' ', 1)),
      COALESCE(v_last_name,
        CASE WHEN position(' ' IN display_name) > 0
             THEN substring(display_name FROM position(' ' IN display_name) + 1)
             ELSE ''
        END
      ),
      COALESCE(v_phone, '')
    )
    ON CONFLICT (id) DO UPDATE
      SET first_name = COALESCE(EXCLUDED.first_name, public.driver_profiles.first_name),
          last_name = COALESCE(EXCLUDED.last_name, public.driver_profiles.last_name),
          phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE public.driver_profiles.phone END;
  ELSE
    INSERT INTO public.company_profiles (id, company_name, email, contact_name, phone)
    VALUES (
      uid,
      COALESCE(v_company_name, ''),
      COALESCE(user_email, ''),
      COALESCE(v_contact_name, display_name),
      COALESCE(v_phone, '')
    )
    ON CONFLICT (id) DO UPDATE
      SET company_name = CASE WHEN EXCLUDED.company_name <> '' THEN EXCLUDED.company_name ELSE public.company_profiles.company_name END,
          contact_name = COALESCE(EXCLUDED.contact_name, public.company_profiles.contact_name),
          phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE public.company_profiles.phone END;
  END IF;

  -- Welcome notification to the user
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

  -- Notify all admins about the new registration
  PERFORM public.notify_admins_new_registration(uid, display_name, chosen_role);
END;
$$;
