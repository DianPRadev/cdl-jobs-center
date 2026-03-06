-- Allow lead matching without a job posting (score against company profile)
-- Make job_id nullable so we can store company-profile-based match scores

-- 1. Drop existing primary key and indexes that require job_id NOT NULL
ALTER TABLE company_driver_match_scores DROP CONSTRAINT IF EXISTS company_driver_match_scores_pkey;
DROP INDEX IF EXISTS idx_cdms_company_job_score;
DROP INDEX IF EXISTS idx_cdms_tier;

-- 2. Make job_id nullable and drop the FK constraint temporarily
ALTER TABLE company_driver_match_scores ALTER COLUMN job_id DROP NOT NULL;

-- 3. Recreate primary key — use COALESCE to handle NULL job_id
--    We use a unique index instead of PK since PK can't handle NULLs in composite
ALTER TABLE company_driver_match_scores
  ADD CONSTRAINT company_driver_match_scores_pkey
  UNIQUE (company_id, job_id, candidate_source, candidate_id);

-- For rows with NULL job_id, add a partial unique index to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_cdms_no_job_unique
  ON company_driver_match_scores (company_id, candidate_source, candidate_id)
  WHERE job_id IS NULL;

-- 4. Recreate indexes
CREATE INDEX IF NOT EXISTS idx_cdms_company_job_score
  ON company_driver_match_scores (company_id, job_id, overall_score DESC);

CREATE INDEX IF NOT EXISTS idx_cdms_tier
  ON company_driver_match_scores (company_id, job_id, rank_tier, overall_score DESC);

-- 5. Also update company_match_feedback and company_match_events to allow NULL job_id
ALTER TABLE company_match_feedback ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE company_match_events ALTER COLUMN job_id DROP NOT NULL;
