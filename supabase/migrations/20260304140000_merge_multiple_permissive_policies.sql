-- ============================================================================
-- Merge multiple permissive policies into single policies per table/role/action.
-- The Supabase linter warns when multiple permissive policies exist for the
-- same (table, role, action) because Postgres OR's them together, which can
-- cause unintended privilege escalation and hurts performance.
-- Fix: combine owner + admin logic into a single policy with OR conditions.
-- ============================================================================

-- ===================== PROFILES =====================

-- SELECT: merge "Users read own profile" + "Admins read all profiles"
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Authenticated read profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- UPDATE: merge "Users update own profile" + "Admins update all profiles"
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Authenticated update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  )
  WITH CHECK (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- ===================== DRIVER_PROFILES =====================

-- SELECT: "Authenticated read driver profiles" (USING true) already covers
-- everything, so "Drivers read own profile" is redundant. Drop it.
DROP POLICY IF EXISTS "Drivers read own profile" ON public.driver_profiles;

-- UPDATE: merge "Drivers update own profile" + "Admins update driver profiles"
DROP POLICY IF EXISTS "Drivers update own profile" ON public.driver_profiles;
DROP POLICY IF EXISTS "Admins update driver profiles" ON public.driver_profiles;
CREATE POLICY "Authenticated update driver profiles" ON public.driver_profiles
  FOR UPDATE TO authenticated
  USING (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  )
  WITH CHECK (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- ===================== COMPANY_PROFILES =====================

-- UPDATE: merge "Companies update own profile" + "Admins update company profiles"
DROP POLICY IF EXISTS "Companies update own profile" ON public.company_profiles;
DROP POLICY IF EXISTS "Admins update company profiles" ON public.company_profiles;
CREATE POLICY "Authenticated update company profiles" ON public.company_profiles
  FOR UPDATE TO authenticated
  USING (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  )
  WITH CHECK (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- ===================== JOBS =====================

-- SELECT: "Public read active jobs" already includes company_id and is_admin
-- checks, making "Companies can read own jobs" entirely redundant. Drop it.
DROP POLICY IF EXISTS "Companies can read own jobs" ON public.jobs;

-- UPDATE: merge "Companies can update own jobs" + "Admins update all jobs"
DROP POLICY IF EXISTS "Companies can update own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins update all jobs" ON public.jobs;
CREATE POLICY "Authenticated update jobs" ON public.jobs
  FOR UPDATE TO authenticated
  USING (
    company_id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  )
  WITH CHECK (
    company_id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- ===================== APPLICATIONS =====================

-- SELECT: merge "driver read own" + "company read own" + "Admins read all"
DROP POLICY IF EXISTS "applications: driver read own" ON public.applications;
DROP POLICY IF EXISTS "applications: company read own" ON public.applications;
DROP POLICY IF EXISTS "Admins read all applications" ON public.applications;
CREATE POLICY "Authenticated read applications" ON public.applications
  FOR SELECT TO authenticated
  USING (
    driver_id = (select auth.uid())
    OR company_id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- ===================== SUBSCRIPTIONS =====================

-- SELECT: merge "Companies read own subscription" + "Admins read all subscriptions"
DROP POLICY IF EXISTS "Companies read own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins read all subscriptions" ON public.subscriptions;
CREATE POLICY "Authenticated read subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    company_id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- INSERT: merge "Companies insert free subscription only" + "Admins insert subscriptions"
-- IMPORTANT: companies restricted to plan='free', lead_limit=3. Admins unrestricted.
DROP POLICY IF EXISTS "Companies insert free subscription only" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins insert subscriptions" ON public.subscriptions;
CREATE POLICY "Authenticated insert subscriptions" ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = (select auth.uid()) AND plan = 'free' AND lead_limit = 3)
    OR public.is_admin((select auth.uid()))
  );

-- ===================== LEADS =====================

-- SELECT: merge "Companies read own leads" + "Admins read all leads"
DROP POLICY IF EXISTS "Companies read own leads" ON public.leads;
DROP POLICY IF EXISTS "Admins read all leads" ON public.leads;
CREATE POLICY "Authenticated read leads" ON public.leads
  FOR SELECT TO authenticated
  USING (
    company_id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- ===================== DRIVER_JOB_MATCH_SCORES =====================

-- SELECT: merge "Drivers read own matches" + "Admins read all driver job match scores"
DROP POLICY IF EXISTS "Drivers read own matches" ON public.driver_job_match_scores;
DROP POLICY IF EXISTS "Admins read all driver job match scores" ON public.driver_job_match_scores;
CREATE POLICY "Authenticated read driver job match scores" ON public.driver_job_match_scores
  FOR SELECT TO authenticated
  USING (
    driver_id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- ===================== COMPANY_DRIVER_MATCH_SCORES =====================

-- SELECT: merge "Companies read own matches" + "Admins read all company driver match scores"
DROP POLICY IF EXISTS "Companies read own matches" ON public.company_driver_match_scores;
DROP POLICY IF EXISTS "Admins read all company driver match scores" ON public.company_driver_match_scores;
CREATE POLICY "Authenticated read company driver match scores" ON public.company_driver_match_scores
  FOR SELECT TO authenticated
  USING (
    company_id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

-- ===================== VERIFICATION_REQUESTS =====================

-- SELECT: merge "Companies can view own" + "Admins can view all"
DROP POLICY IF EXISTS "Companies can view own verification requests" ON public.verification_requests;
DROP POLICY IF EXISTS "Admins can view all verification requests" ON public.verification_requests;
CREATE POLICY "Authenticated read verification requests" ON public.verification_requests
  FOR SELECT TO authenticated
  USING (
    company_id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );
