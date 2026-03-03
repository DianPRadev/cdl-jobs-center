-- ============================================================================
-- Fix: Make verification-documents bucket private.
-- Documents (business licenses, DOT certs, insurance) were publicly accessible.
-- Switch to private bucket with owner + admin read access only.
-- Frontend must use createSignedUrl() instead of getPublicUrl().
-- ============================================================================

-- 1. Make bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'verification-documents';

-- 2. Drop the public read policy
DROP POLICY IF EXISTS "Public read verification docs" ON storage.objects;

-- 3. Companies can read their own verification docs
CREATE POLICY "Companies read own verification docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'verification-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Admins can read all verification docs
CREATE POLICY "Admins read all verification docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'verification-documents'
    AND public.is_admin((select auth.uid()))
  );
