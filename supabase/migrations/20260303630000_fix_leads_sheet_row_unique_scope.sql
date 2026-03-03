-- Fix leads sync collisions across companies.
-- Legacy schema versions enforced global uniqueness on sheet_row_id
-- (constraint/index: leads_sheet_row_id_key), which breaks multi-tenant sync.

-- Drop legacy global uniqueness (idempotent).
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_sheet_row_id_key;

DROP INDEX IF EXISTS public.leads_sheet_row_id_key;

-- Ensure per-company uniqueness for idempotent upserts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.leads'::regclass
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE 'UNIQUE (company_id, sheet_row_id)%'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_company_sheet_unique UNIQUE (company_id, sheet_row_id);
  END IF;
END $$;
