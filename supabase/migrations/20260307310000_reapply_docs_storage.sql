-- ============================================================================
-- Reapply documents: storage bucket + company_profiles columns
-- Companies can upload supporting files when requesting re-review.
-- Security: private bucket, strict MIME whitelist, 10 MB limit, path isolation.
-- ============================================================================

-- ── company_profiles extra columns ───────────────────────────────────────────
ALTER TABLE public.company_profiles
  ADD COLUMN IF NOT EXISTS reapply_note      TEXT,
  ADD COLUMN IF NOT EXISTS reapply_doc_paths TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reapply_banned    BOOLEAN DEFAULT FALSE NOT NULL;

-- ── Storage bucket ────────────────────────────────────────────────────────────
-- Private (not public), 10 MB per file, safe MIME types only.
-- Executable, script, and archive types are intentionally excluded.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reapply-docs',
  'reapply-docs',
  false,
  10485760,  -- 10 MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public            = false,
  file_size_limit   = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain'
  ];

-- ── RLS policies on storage.objects ──────────────────────────────────────────

-- Companies can upload only into their own folder ({user_id}/*)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Companies upload own reapply docs'
      AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Companies upload own reapply docs"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'reapply-docs'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
        AND NOT public.is_admin((select auth.uid()))
      );
  END IF;
END $$;

-- Companies can read their own files; admins can read all
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Companies read own reapply docs'
      AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Companies read own reapply docs"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'reapply-docs'
        AND (
          (storage.foldername(name))[1] = (select auth.uid())::text
          OR public.is_admin((select auth.uid()))
        )
      );
  END IF;
END $$;

-- Companies can delete their own files (e.g. remove before submitting)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Companies delete own reapply docs'
      AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Companies delete own reapply docs"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'reapply-docs'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
        AND NOT public.is_admin((select auth.uid()))
      );
  END IF;
END $$;
