-- ============================================================================
-- Fix driver_profiles_safe view — switch from SECURITY DEFINER to INVOKER
-- The linter flagged this view as SECURITY DEFINER (the Postgres default for
-- views). This means the view bypasses RLS of the querying user and runs as
-- the view owner. Switching to SECURITY INVOKER makes the view respect the
-- caller's RLS policies, which is the correct behavior.
-- ============================================================================

-- Recreate the view with security_invoker = true
CREATE OR REPLACE VIEW public.driver_profiles_safe
  WITH (security_invoker = true)
  AS
  SELECT
    id,
    first_name,
    last_name,
    license_class,
    years_exp,
    license_state,
    about,
    updated_at
  FROM public.driver_profiles;

-- Re-grant permissions (CREATE OR REPLACE resets grants)
GRANT SELECT ON public.driver_profiles_safe TO authenticated;
REVOKE ALL ON public.driver_profiles_safe FROM anon;

-- Ensure there is an RLS policy on driver_profiles that allows authenticated
-- users to read the columns exposed by this view. Without this the view would
-- return zero rows for company users.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'driver_profiles'
      AND policyname = 'Authenticated read driver profiles'
  ) THEN
    CREATE POLICY "Authenticated read driver profiles"
      ON public.driver_profiles
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END
$$;
