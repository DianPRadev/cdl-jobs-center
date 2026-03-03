-- ============================================================================
-- Fix: Revoke EXECUTE on internal SECURITY DEFINER functions from public roles.
-- By default, PostgreSQL grants EXECUTE to PUBLIC on all functions.
-- Internal functions (triggers, cron helpers) should not be RPC-callable.
-- User-facing RPCs keep authenticated access.
-- ============================================================================

-- ===================== INTERNAL FUNCTIONS (service_role only) =====================
-- These are trigger functions or internal helpers — no user should call them via RPC.

-- Trigger functions
REVOKE EXECUTE ON FUNCTION public.trg_notify_new_application() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_stage_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_new_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_driver_match() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_company_match() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_new_lead() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_verification_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_welcome() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_match_recompute() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_driver_feedback_recompute() FROM PUBLIC, anon, authenticated;

-- Internal helpers (called by triggers or cron, not by users)
REVOKE EXECUTE ON FUNCTION public.notify_user(UUID, public.notification_type, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_recompute_batch(INT) FROM PUBLIC, anon, authenticated;

-- Grant claim_recompute_batch to service_role only (called by edge function)
GRANT EXECUTE ON FUNCTION public.claim_recompute_batch(INT) TO service_role;

-- ===================== USER-FACING RPCs (authenticated only) =====================
-- These are intentionally callable by logged-in users.

REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.clear_all_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_all_notifications() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_onboarding(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(TEXT) TO authenticated;

-- is_admin already has proper REVOKE/GRANT from 20260301110000
