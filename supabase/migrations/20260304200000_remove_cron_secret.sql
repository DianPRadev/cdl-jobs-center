-- ============================================================================
-- Remove stale cron secret from app_config.
-- The cron job now uses service_role_key (since 20260303600000), so the
-- match_cron_secret entry is no longer needed. The hardcoded value was
-- committed in migration files and should be considered compromised.
-- ============================================================================

DELETE FROM public.app_config WHERE key = 'match_cron_secret';
