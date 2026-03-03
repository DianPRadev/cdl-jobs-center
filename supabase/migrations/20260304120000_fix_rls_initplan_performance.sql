-- ============================================================================
-- Fix RLS initplan performance warnings
-- Wraps auth.uid() in (select auth.uid()) so Postgres evaluates it once
-- per query instead of per row. Same for auth.role() and is_admin().
-- ============================================================================

-- ===================== PROFILES =====================

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles: owner read" ON public.profiles;

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;

DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin read all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));

-- ===================== DRIVER_PROFILES =====================

DROP POLICY IF EXISTS "Drivers read own profile" ON public.driver_profiles;
CREATE POLICY "Drivers read own profile" ON public.driver_profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated read driver profiles" ON public.driver_profiles;
CREATE POLICY "Authenticated read driver profiles" ON public.driver_profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Drivers insert own profile" ON public.driver_profiles;
DROP POLICY IF EXISTS "driver_profiles: owner insert" ON public.driver_profiles;
CREATE POLICY "Drivers insert own profile" ON public.driver_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Drivers update own profile" ON public.driver_profiles;
DROP POLICY IF EXISTS "driver_profiles: owner update" ON public.driver_profiles;
CREATE POLICY "Drivers update own profile" ON public.driver_profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins update driver profiles" ON public.driver_profiles;
CREATE POLICY "Admins update driver profiles" ON public.driver_profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));

-- ===================== COMPANY_PROFILES =====================

DROP POLICY IF EXISTS "Companies update own profile" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles: owner update" ON public.company_profiles;
DROP POLICY IF EXISTS "Users can update own company profile" ON public.company_profiles;
CREATE POLICY "Companies update own profile" ON public.company_profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Companies insert own profile" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles: owner insert" ON public.company_profiles;
CREATE POLICY "Companies insert own profile" ON public.company_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins update company profiles" ON public.company_profiles;
CREATE POLICY "Admins update company profiles" ON public.company_profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));

-- ===================== JOBS =====================

DROP POLICY IF EXISTS "Public read active jobs" ON public.jobs;
CREATE POLICY "Public read active jobs" ON public.jobs
  FOR SELECT
  USING (
    status = 'Active'
    OR company_id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

DROP POLICY IF EXISTS "Companies can insert jobs" ON public.jobs;
DROP POLICY IF EXISTS "jobs: company insert" ON public.jobs;
CREATE POLICY "Companies can insert jobs" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (select auth.uid()));

DROP POLICY IF EXISTS "Companies can read own jobs" ON public.jobs;
DROP POLICY IF EXISTS "jobs: company read own" ON public.jobs;
CREATE POLICY "Companies can read own jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (company_id = (select auth.uid()));

DROP POLICY IF EXISTS "Companies can update own jobs" ON public.jobs;
DROP POLICY IF EXISTS "jobs: company update" ON public.jobs;
CREATE POLICY "Companies can update own jobs" ON public.jobs
  FOR UPDATE TO authenticated
  USING (company_id = (select auth.uid()))
  WITH CHECK (company_id = (select auth.uid()));

DROP POLICY IF EXISTS "Companies can delete own jobs" ON public.jobs;
DROP POLICY IF EXISTS "jobs: company delete" ON public.jobs;
CREATE POLICY "Companies can delete own jobs" ON public.jobs
  FOR DELETE TO authenticated
  USING (company_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins update all jobs" ON public.jobs;
CREATE POLICY "Admins update all jobs" ON public.jobs
  FOR UPDATE TO authenticated
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));

-- ===================== APPLICATIONS =====================

DROP POLICY IF EXISTS "applications: driver insert" ON public.applications;
CREATE POLICY "applications: driver insert" ON public.applications
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "applications: driver read own" ON public.applications;
CREATE POLICY "applications: driver read own" ON public.applications
  FOR SELECT TO authenticated
  USING (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "applications: company read own" ON public.applications;
CREATE POLICY "applications: company read own" ON public.applications
  FOR SELECT TO authenticated
  USING (company_id = (select auth.uid()));

DROP POLICY IF EXISTS "applications: company update" ON public.applications;
CREATE POLICY "applications: company update" ON public.applications
  FOR UPDATE TO authenticated
  USING (company_id = (select auth.uid()))
  WITH CHECK (company_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins read all applications" ON public.applications;
CREATE POLICY "Admins read all applications" ON public.applications
  FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

-- ===================== SAVED_JOBS =====================

DROP POLICY IF EXISTS "saved_jobs: driver read" ON public.saved_jobs;
CREATE POLICY "saved_jobs: driver read" ON public.saved_jobs
  FOR SELECT TO authenticated
  USING (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "saved_jobs: driver insert" ON public.saved_jobs;
CREATE POLICY "saved_jobs: driver insert" ON public.saved_jobs
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "saved_jobs: driver delete" ON public.saved_jobs;
CREATE POLICY "saved_jobs: driver delete" ON public.saved_jobs
  FOR DELETE TO authenticated
  USING (driver_id = (select auth.uid()));

-- ===================== MESSAGES =====================
-- Messages use application_id to scope access. The existing policies check
-- membership via the applications table (driver_id or company_id = auth.uid()).

DROP POLICY IF EXISTS "read own conversations" ON public.messages;
CREATE POLICY "read own conversations" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND (a.driver_id = (select auth.uid()) OR a.company_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "send in own conversations" ON public.messages;
CREATE POLICY "send in own conversations" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = (select auth.uid()));

DROP POLICY IF EXISTS "mark received as read" ON public.messages;
CREATE POLICY "mark received as read" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND (a.driver_id = (select auth.uid()) OR a.company_id = (select auth.uid()))
    )
    AND sender_id != (select auth.uid())
  );

-- ===================== SUBSCRIPTIONS =====================

DROP POLICY IF EXISTS "Companies read own subscription" ON public.subscriptions;
CREATE POLICY "Companies read own subscription" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (company_id = (select auth.uid()));

-- Only allow free plan inserts. The unrestricted "Companies insert own subscription"
-- policy is intentionally NOT recreated — it would bypass the plan='free' restriction.
-- Subscription upgrades happen via Stripe webhook (service_role) only.
DROP POLICY IF EXISTS "Companies insert own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Companies insert free subscription only" ON public.subscriptions;
CREATE POLICY "Companies insert free subscription only" ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (select auth.uid())
    AND plan = 'free'
    AND lead_limit = 3
  );

-- No company UPDATE policy — only Stripe webhook (service_role) and admins
-- can update subscription plan/limits/status. This is intentional security hardening.
DROP POLICY IF EXISTS "Companies update own subscription" ON public.subscriptions;

-- ===================== LEADS =====================

DROP POLICY IF EXISTS "Companies read own leads" ON public.leads;
CREATE POLICY "Companies read own leads" ON public.leads
  FOR SELECT TO authenticated
  USING (company_id = (select auth.uid()));

DROP POLICY IF EXISTS "Companies update own leads" ON public.leads;
CREATE POLICY "Companies update own leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (company_id = (select auth.uid()))
  WITH CHECK (company_id = (select auth.uid()));

DROP POLICY IF EXISTS "Companies insert own leads" ON public.leads;
CREATE POLICY "Companies insert own leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (select auth.uid()));

DROP POLICY IF EXISTS "Service role manages leads" ON public.leads;
CREATE POLICY "Service role manages leads" ON public.leads
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ===================== DRIVER_JOB_MATCH_SCORES =====================

DROP POLICY IF EXISTS "Drivers read own matches" ON public.driver_job_match_scores;
CREATE POLICY "Drivers read own matches" ON public.driver_job_match_scores
  FOR SELECT TO authenticated
  USING (driver_id = (select auth.uid()));

-- ===================== COMPANY_DRIVER_MATCH_SCORES =====================

DROP POLICY IF EXISTS "Companies read own matches" ON public.company_driver_match_scores;
CREATE POLICY "Companies read own matches" ON public.company_driver_match_scores
  FOR SELECT TO authenticated
  USING (company_id = (select auth.uid()));

-- ===================== MATCHING_ROLLOUT_CONFIG =====================

DROP POLICY IF EXISTS "Authenticated read rollout config" ON public.matching_rollout_config;
CREATE POLICY "Authenticated read rollout config" ON public.matching_rollout_config
  FOR SELECT TO authenticated
  USING (true);

-- ===================== DRIVER_MATCH_FEEDBACK =====================

DROP POLICY IF EXISTS "Drivers read own match feedback" ON public.driver_match_feedback;
CREATE POLICY "Drivers read own match feedback" ON public.driver_match_feedback
  FOR SELECT TO authenticated
  USING (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "Drivers insert own match feedback" ON public.driver_match_feedback;
CREATE POLICY "Drivers insert own match feedback" ON public.driver_match_feedback
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "Drivers update own match feedback" ON public.driver_match_feedback;
CREATE POLICY "Drivers update own match feedback" ON public.driver_match_feedback
  FOR UPDATE TO authenticated
  USING (driver_id = (select auth.uid()))
  WITH CHECK (driver_id = (select auth.uid()));

-- ===================== DRIVER_MATCH_EVENTS =====================

DROP POLICY IF EXISTS "Drivers read own match events" ON public.driver_match_events;
CREATE POLICY "Drivers read own match events" ON public.driver_match_events
  FOR SELECT TO authenticated
  USING (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "Drivers insert own match events" ON public.driver_match_events;
CREATE POLICY "Drivers insert own match events" ON public.driver_match_events
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = (select auth.uid()));

-- ===================== NOTIFICATIONS =====================

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- ===================== VERIFICATION_REQUESTS =====================

DROP POLICY IF EXISTS "Companies can view own verification requests" ON public.verification_requests;
CREATE POLICY "Companies can view own verification requests" ON public.verification_requests
  FOR SELECT TO authenticated
  USING (company_id = (select auth.uid()));

DROP POLICY IF EXISTS "Companies can insert own verification requests" ON public.verification_requests;
CREATE POLICY "Companies can insert own verification requests" ON public.verification_requests
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (select auth.uid()) AND status = 'pending');

DROP POLICY IF EXISTS "Admins can view all verification requests" ON public.verification_requests;
CREATE POLICY "Admins can view all verification requests" ON public.verification_requests
  FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can update verification requests" ON public.verification_requests;
CREATE POLICY "Admins can update verification requests" ON public.verification_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));

-- ===================== ADMIN POLICIES (remaining tables) =====================

-- subscriptions
DROP POLICY IF EXISTS "Admins read all subscriptions" ON public.subscriptions;
CREATE POLICY "Admins read all subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins insert subscriptions" ON public.subscriptions;
CREATE POLICY "Admins insert subscriptions" ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins update subscriptions" ON public.subscriptions;
CREATE POLICY "Admins update subscriptions" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));

-- leads
DROP POLICY IF EXISTS "Admins read all leads" ON public.leads;
CREATE POLICY "Admins read all leads" ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

-- driver_job_match_scores
DROP POLICY IF EXISTS "Admins read all driver job match scores" ON public.driver_job_match_scores;
CREATE POLICY "Admins read all driver job match scores" ON public.driver_job_match_scores
  FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

-- company_driver_match_scores
DROP POLICY IF EXISTS "Admins read all company driver match scores" ON public.company_driver_match_scores;
CREATE POLICY "Admins read all company driver match scores" ON public.company_driver_match_scores
  FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

-- matching_recompute_queue
DROP POLICY IF EXISTS "Admins read recompute queue" ON public.matching_recompute_queue;
CREATE POLICY "Admins read recompute queue" ON public.matching_recompute_queue
  FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

-- matching_text_embeddings
DROP POLICY IF EXISTS "Admins read text embeddings" ON public.matching_text_embeddings;
CREATE POLICY "Admins read text embeddings" ON public.matching_text_embeddings
  FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

-- ===================== COMPANY_PROFILES public read =====================

DROP POLICY IF EXISTS "Public read company profiles" ON public.company_profiles;
CREATE POLICY "Public read company profiles" ON public.company_profiles
  FOR SELECT
  USING (true);
