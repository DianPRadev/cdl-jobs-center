-- ============================================================================
-- Fix mutable search_path on all public functions
-- Adds SET search_path = '' to prevent search_path manipulation attacks.
-- Also fixes the notifications INSERT policy to scope it to service_role.
-- ============================================================================

-- 1. mark_notifications_read(UUID[])
ALTER FUNCTION public.mark_notifications_read(UUID[]) SET search_path = '';

-- 2. mark_all_notifications_read()
ALTER FUNCTION public.mark_all_notifications_read() SET search_path = '';

-- 3. trg_notify_stage_change()
ALTER FUNCTION public.trg_notify_stage_change() SET search_path = '';

-- 4. trg_notify_new_message()
ALTER FUNCTION public.trg_notify_new_message() SET search_path = '';

-- 5. trg_notify_driver_match()
ALTER FUNCTION public.trg_notify_driver_match() SET search_path = '';

-- 6. trg_notify_new_lead()
ALTER FUNCTION public.trg_notify_new_lead() SET search_path = '';

-- 7. trg_notify_verification_update()
ALTER FUNCTION public.trg_notify_verification_update() SET search_path = '';

-- 8. notify_user(UUID, notification_type, TEXT, TEXT, JSONB)
ALTER FUNCTION public.notify_user(UUID, notification_type, TEXT, TEXT, JSONB) SET search_path = '';

-- 9. trg_notify_new_application()
ALTER FUNCTION public.trg_notify_new_application() SET search_path = '';

-- 10. trg_notify_company_match()
ALTER FUNCTION public.trg_notify_company_match() SET search_path = '';

-- 11. enqueue_match_recompute()
ALTER FUNCTION public.enqueue_match_recompute() SET search_path = '';

-- 12. clear_all_notifications()
ALTER FUNCTION public.clear_all_notifications() SET search_path = '';

-- 13. trg_notify_welcome()
ALTER FUNCTION public.trg_notify_welcome() SET search_path = '';

-- 14. is_admin(uuid) — already has SET search_path = public, change to ''
ALTER FUNCTION public.is_admin(uuid) SET search_path = '';

-- 15. claim_recompute_batch(INT)
ALTER FUNCTION public.claim_recompute_batch(INT) SET search_path = '';

-- 16. enqueue_driver_feedback_recompute()
ALTER FUNCTION public.enqueue_driver_feedback_recompute() SET search_path = '';

-- 17. set_updated_at() — common trigger, may exist from Supabase defaults
DO $$ BEGIN
  ALTER FUNCTION public.set_updated_at() SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ============================================================================
-- Fix notifications INSERT policy — scope to service_role only
-- The linter flags WITH CHECK (true) as overly permissive.
-- Triggers run as SECURITY DEFINER so they bypass RLS anyway, but scoping
-- the policy to service_role makes the intent explicit.
-- ============================================================================
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  TO service_role
  WITH CHECK (true);
