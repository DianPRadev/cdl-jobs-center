-- Attach handle_new_user trigger to auth.users so profiles rows are
-- auto-created for ALL auth methods (email, Google, Facebook, etc.).
-- The function already exists (20260301120000_production_hardening.sql)
-- and uses ON CONFLICT DO NOTHING, so existing users are unaffected.

-- Also add an "needs_onboarding" column to profiles so we can track
-- whether a social-login user has completed role selection.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS needs_onboarding boolean NOT NULL DEFAULT false;

-- Update handle_new_user to set needs_onboarding = true when there is
-- no role in user_metadata (i.e. social login users).
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

  -- Only allow driver or company from signup; block admin escalation
  IF raw_role IN ('driver', 'company') THEN
    safe_role := raw_role;
    onboarding := false;
  ELSE
    -- No role specified (social login) — default to driver, flag for onboarding
    safe_role := 'driver';
    onboarding := true;
  END IF;

  INSERT INTO public.profiles (id, name, role, email, needs_onboarding)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    safe_role,
    NEW.email,
    onboarding
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Attach the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
