-- ============================================================================
-- Fix index warnings from Supabase linter
-- 1. Add missing indexes on foreign key columns (unindexed_foreign_keys)
-- 2. Drop unused indexes (unused_index)
-- ============================================================================

-- ===================== ADD MISSING FOREIGN KEY INDEXES =====================

CREATE INDEX IF NOT EXISTS idx_applications_job_id
  ON public.applications (job_id);

CREATE INDEX IF NOT EXISTS idx_company_driver_match_scores_job_id
  ON public.company_driver_match_scores (job_id);

CREATE INDEX IF NOT EXISTS idx_driver_match_events_job_id
  ON public.driver_match_events (job_id);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_job_id
  ON public.saved_jobs (job_id);

CREATE INDEX IF NOT EXISTS idx_verification_requests_company_id
  ON public.verification_requests (company_id);

CREATE INDEX IF NOT EXISTS idx_verification_requests_reviewed_by
  ON public.verification_requests (reviewed_by);

-- ===================== DROP UNUSED INDEXES =====================

DROP INDEX IF EXISTS public.idx_leads_state;
DROP INDEX IF EXISTS public.idx_leads_status;
DROP INDEX IF EXISTS public.idx_dme_driver_type_created;
