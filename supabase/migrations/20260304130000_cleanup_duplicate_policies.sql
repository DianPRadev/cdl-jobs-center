-- ============================================================================
-- Cleanup duplicate/stale RLS policies left over from earlier migrations.
-- Our previous migration created clean policies but didn't drop old ones
-- with different names that do the same thing.
-- ============================================================================

-- ===================== PROFILES =====================
DROP POLICY IF EXISTS "profiles: auth read" ON public.profiles;
DROP POLICY IF EXISTS "profiles: owner read" ON public.profiles;
DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

-- ===================== DRIVER_PROFILES =====================
DROP POLICY IF EXISTS "driver_profiles: public read" ON public.driver_profiles;
DROP POLICY IF EXISTS "Admins read all driver_profiles" ON public.driver_profiles;

-- ===================== COMPANY_PROFILES =====================
DROP POLICY IF EXISTS "company_profiles: public read" ON public.company_profiles;
DROP POLICY IF EXISTS "Public can read company profiles" ON public.company_profiles;
DROP POLICY IF EXISTS "Admins read all company_profiles" ON public.company_profiles;
DROP POLICY IF EXISTS "Companies can insert own profile" ON public.company_profiles;
DROP POLICY IF EXISTS "Companies can update own profile" ON public.company_profiles;

-- ===================== JOBS =====================
DROP POLICY IF EXISTS "jobs: public read active" ON public.jobs;
DROP POLICY IF EXISTS "Public read jobs" ON public.jobs;
DROP POLICY IF EXISTS "Public can read active jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can read all jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can update jobs" ON public.jobs;

-- ===================== APPLICATIONS =====================
DROP POLICY IF EXISTS "Admins can read all applications" ON public.applications;

-- ===================== SUBSCRIPTIONS =====================
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins full access subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can read subscriptions" ON public.subscriptions;

-- ===================== LEADS =====================
DROP POLICY IF EXISTS "Admins can read all leads" ON public.leads;
