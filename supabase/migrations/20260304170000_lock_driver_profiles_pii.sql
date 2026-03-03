-- ============================================================================
-- Fix: Remove broad USING(true) policy on driver_profiles that exposes PII.
-- Any authenticated user could query the base table and read phone, cdl_number,
-- date_of_birth, home_address. The frontend uses driver_profiles_safe view,
-- but the RLS policy was wide open.
--
-- Solution:
-- 1. Remove the broad "Authenticated read driver profiles" USING(true) policy
-- 2. Revert driver_profiles_safe to SECURITY DEFINER (default) so it can
--    read the base table on behalf of callers while only exposing safe columns
-- 3. Keep owner-only read on the base table (drivers read their own full row)
-- ============================================================================

-- 1. Remove the overly permissive read policy
DROP POLICY IF EXISTS "Authenticated read driver profiles" ON public.driver_profiles;

-- 2. Ensure drivers can still read their own full profile
DROP POLICY IF EXISTS "Drivers read own profile" ON public.driver_profiles;
CREATE POLICY "Drivers read own profile" ON public.driver_profiles
  FOR SELECT TO authenticated
  USING (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- 3. Recreate the safe view as SECURITY DEFINER (PostgreSQL default for views)
-- This lets the view read all rows from driver_profiles regardless of the
-- caller's RLS, but only exposes non-sensitive columns.
CREATE OR REPLACE VIEW public.driver_profiles_safe AS
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

-- Grant access to authenticated users only (no anon)
GRANT SELECT ON public.driver_profiles_safe TO authenticated;
REVOKE ALL ON public.driver_profiles_safe FROM anon;
