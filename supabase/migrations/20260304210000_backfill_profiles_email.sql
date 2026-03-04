-- Backfill profiles.email from auth.users for all existing users,
-- and update handle_new_user() to populate email for future signups.

-- 1. Backfill existing profiles
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;

-- 2. Update trigger to include email for future signups
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
BEGIN
  raw_role := NEW.raw_user_meta_data ->> 'role';

  IF raw_role IN ('driver', 'company') THEN
    safe_role := raw_role;
    onboarding := false;
  ELSE
    safe_role := 'driver';
    onboarding := true;
  END IF;

  INSERT INTO public.profiles (id, name, role, email, needs_onboarding)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'name',
      NEW.raw_user_meta_data ->> 'full_name',
      split_part(NEW.email, '@', 1)
    ),
    safe_role,
    NEW.email,
    onboarding
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  WHERE public.profiles.email IS NULL;

  RETURN NEW;
END;
$$;
