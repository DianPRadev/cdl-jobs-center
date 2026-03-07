-- ============================================================================
-- Notify companies when their verification status changes via the admin
-- "Approve" / "Decline" buttons (which update company_profiles directly).
-- ============================================================================

-- Trigger function: fires on UPDATE of company_profiles
CREATE OR REPLACE FUNCTION trg_notify_company_verification()
RETURNS TRIGGER AS $$
DECLARE
  v_company_name TEXT;
BEGIN
  v_company_name := COALESCE(NEW.company_name, 'Your company');

  -- ── Approved ────────────────────────────────────────────────────────────
  -- is_verified flipped to TRUE (and was not already TRUE)
  IF (OLD.is_verified IS DISTINCT FROM NEW.is_verified)
     AND NEW.is_verified = true THEN

    PERFORM notify_user(
      NEW.id,
      'verification_update',
      'Verification Approved ✓',
      v_company_name || ' has been verified! You now have full access to the platform.',
      jsonb_build_object(
        'decision', 'approved',
        'company_name', v_company_name,
        'link', '/dashboard'
      )
    );

  -- ── Declined ─────────────────────────────────────────────────────────────
  -- decline_reason became non-NULL (and was previously NULL)
  ELSIF (OLD.decline_reason IS NULL AND NEW.decline_reason IS NOT NULL) THEN

    PERFORM notify_user(
      NEW.id,
      'verification_update',
      'Account Verification Declined',
      'Your company account was not approved at this time.' ||
        CASE WHEN NEW.decline_reason != ''
          THEN ' Reason: ' || NEW.decline_reason
          ELSE ''
        END,
      jsonb_build_object(
        'decision', 'declined',
        'decline_reason', NEW.decline_reason,
        'company_name', v_company_name,
        'link', '/dashboard'
      )
    );

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS notify_company_verification ON public.company_profiles;
CREATE TRIGGER notify_company_verification
  AFTER UPDATE ON public.company_profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_notify_company_verification();
