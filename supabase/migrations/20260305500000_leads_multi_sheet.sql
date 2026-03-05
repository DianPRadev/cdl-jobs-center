-- ============================================================
-- Leads: multi-sheet support
-- Add lead_type and source_sheet columns, make company_id nullable,
-- update unique constraint for multi-sheet dedup
-- ============================================================

-- New columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type TEXT CHECK (lead_type IN ('owner_operator', 'company_driver')) DEFAULT 'owner_operator';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_sheet TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS date_submitted TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS violations TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS availability TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;

-- Drop old unique constraint if it exists (company_id, sheet_row_id)
DO $$
BEGIN
  -- Try to drop the constraint by common names
  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_company_id_sheet_row_id_key;
  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_sheet_row_id_company_id_key;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- New unique constraint: source_sheet + sheet_row_id (one row per sheet+row combo)
CREATE UNIQUE INDEX IF NOT EXISTS leads_source_sheet_row_id_key
  ON leads (source_sheet, sheet_row_id)
  WHERE source_sheet IS NOT NULL AND sheet_row_id IS NOT NULL;

-- Allow admin reads (RLS)
DROP POLICY IF EXISTS "Admins can read all leads" ON leads;
CREATE POLICY "Admins can read all leads" ON leads
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
