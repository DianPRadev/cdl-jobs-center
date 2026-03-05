-- Fix: double welcome notification. handle_new_user() already sends welcome
-- for non-onboarding users, and complete_onboarding() sends it for onboarding
-- users. The trg_notify_welcome() trigger on profiles INSERT was a third source
-- that duplicated the notification. Remove it.

DROP TRIGGER IF EXISTS notify_welcome ON profiles;
DROP FUNCTION IF EXISTS trg_notify_welcome();
