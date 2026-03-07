-- Restrict leads and AI match scores to verified companies only.
-- Unverified or declined companies are blocked at the UI layer, but this
-- ensures the database also rejects direct API access from unverified accounts.

-- Helper: returns true if the calling user is a verified (and not declined) company.
-- Inlined as a subquery so Postgres can use it as an init-plan (evaluated once per query).

-- ===================== LEADS =====================

DROP POLICY IF EXISTS "Authenticated read leads" ON public.leads;
CREATE POLICY "Verified company or admin read leads" ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.is_admin((select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.company_profiles
      WHERE id = (select auth.uid())
        AND is_verified = true
        AND decline_reason IS NULL
    )
  );

DROP POLICY IF EXISTS "Authenticated update leads" ON public.leads;
CREATE POLICY "Verified company or admin update leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    public.is_admin((select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.company_profiles
      WHERE id = (select auth.uid())
        AND is_verified = true
        AND decline_reason IS NULL
    )
  )
  WITH CHECK (
    public.is_admin((select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.company_profiles
      WHERE id = (select auth.uid())
        AND is_verified = true
        AND decline_reason IS NULL
    )
  );

-- ===================== COMPANY_DRIVER_MATCH_SCORES =====================
-- AI match scores — same verification requirement as leads.

DROP POLICY IF EXISTS "Authenticated read company driver match scores" ON public.company_driver_match_scores;
CREATE POLICY "Verified company or admin read company driver match scores" ON public.company_driver_match_scores
  FOR SELECT TO authenticated
  USING (
    company_id = (select auth.uid())
    AND (
      public.is_admin((select auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.company_profiles
        WHERE id = (select auth.uid())
          AND is_verified = true
          AND decline_reason IS NULL
      )
    )
  );
