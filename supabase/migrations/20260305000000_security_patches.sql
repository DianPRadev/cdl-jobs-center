-- ============================================================================
-- Security patches: prevent privilege escalation and unauthorized data access
-- Findings from security audit 2026-03-05
-- ============================================================================

-- ===================== FINDING 1: Prevent role self-escalation =====================
-- A BEFORE UPDATE trigger on profiles that blocks role changes unless the
-- caller is a privileged context (SECURITY DEFINER function or service_role).
-- This prevents authenticated users from setting role='admin' on their own row.

CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- In Supabase PostgREST, direct user requests run as current_user = 'authenticated'.
    -- SECURITY DEFINER functions (complete_onboarding) run as 'postgres'.
    -- Service role requests run as 'service_role'.
    -- Only allow role changes from privileged contexts.
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
      RAISE EXCEPTION 'Changing the role column is forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function is internal — not callable by end users
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_role_immutable ON public.profiles;
CREATE TRIGGER enforce_role_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_change();

-- ===================== FINDING 2: company_profiles INSERT — role check =====================
-- Only users with role='company' can insert into company_profiles.
-- complete_onboarding (SECURITY DEFINER) bypasses RLS, so onboarding still works.

DROP POLICY IF EXISTS "Companies insert own profile" ON public.company_profiles;
CREATE POLICY "Companies insert own profile" ON public.company_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = (select auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = (select auth.uid())) = 'company'
  );

-- ===================== FINDING 3: jobs INSERT — role check =====================
-- Only users with role='company' can insert jobs.

DROP POLICY IF EXISTS "Companies can insert jobs" ON public.jobs;
CREATE POLICY "Companies can insert jobs" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (select auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = (select auth.uid())) = 'company'
  );

-- ===================== FINDING 4: messages INSERT — participant check =====================
-- Sender must be a participant (driver or company) on the referenced application.

DROP POLICY IF EXISTS "send in own conversations" ON public.messages;
CREATE POLICY "send in own conversations" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND (a.driver_id = (select auth.uid()) OR a.company_id = (select auth.uid()))
    )
  );
