-- =============================================================
-- Company AI Matching v2: new columns, feedback/events tables
-- =============================================================

-- 1. Add v2 columns to company_driver_match_scores
ALTER TABLE company_driver_match_scores
  ADD COLUMN IF NOT EXISTS behavior_score   SMALLINT NOT NULL DEFAULT 0 CHECK (behavior_score BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS confidence       TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS missing_fields   JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS hard_blocked     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hard_block_reasons JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS rank_tier        TEXT NOT NULL DEFAULT 'explore' CHECK (rank_tier IN ('hot', 'warm', 'explore', 'blocked'));

-- Index for tier-based queries
CREATE INDEX IF NOT EXISTS idx_cdms_tier
  ON company_driver_match_scores (company_id, job_id, rank_tier, overall_score DESC);

-- 2. Company match feedback table
CREATE TABLE IF NOT EXISTS company_match_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_source TEXT NOT NULL CHECK (candidate_source IN ('application', 'lead')),
  candidate_id    UUID NOT NULL,
  feedback        TEXT NOT NULL CHECK (feedback IN ('helpful', 'not_relevant', 'hide', 'contacted', 'interviewed', 'hired')),
  reason_code     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_id, candidate_source, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_cmf_company
  ON company_match_feedback (company_id, feedback);

ALTER TABLE company_match_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies manage own feedback"
  ON company_match_feedback FOR ALL
  USING (company_id = auth.uid())
  WITH CHECK (company_id = auth.uid());

-- 3. Company match events table (for learning loop)
CREATE TABLE IF NOT EXISTS company_match_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_source TEXT NOT NULL CHECK (candidate_source IN ('application', 'lead')),
  candidate_id    UUID NOT NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN ('view', 'save', 'message', 'open_profile', 'contact')),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cme_company
  ON company_match_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cme_candidate
  ON company_match_events (company_id, candidate_source, candidate_id, event_type);

ALTER TABLE company_match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies manage own events"
  ON company_match_events FOR ALL
  USING (company_id = auth.uid())
  WITH CHECK (company_id = auth.uid());

-- 4. Trigger: enqueue recompute when company feedback changes
CREATE OR REPLACE FUNCTION enqueue_company_feedback_recompute()
RETURNS TRIGGER AS $$
BEGIN
  -- Re-score the candidate against all company jobs when feedback changes
  IF NEW.candidate_source = 'application' THEN
    INSERT INTO matching_recompute_queue (entity_type, entity_id, company_id, reason)
    VALUES ('application', NEW.candidate_id, NEW.company_id, 'feedback_updated')
    ON CONFLICT DO NOTHING;
  ELSIF NEW.candidate_source = 'lead' THEN
    INSERT INTO matching_recompute_queue (entity_type, entity_id, company_id, reason)
    VALUES ('lead', NEW.candidate_id, NEW.company_id, 'feedback_updated')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_company_feedback_recompute
  AFTER INSERT OR UPDATE ON company_match_feedback
  FOR EACH ROW EXECUTE FUNCTION enqueue_company_feedback_recompute();

-- 5. Enable company UI (rollout gate)
UPDATE matching_rollout_config
SET company_ui_enabled = TRUE,
    updated_at = now()
WHERE id = 1;
