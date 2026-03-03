-- Fix: ALTER DATABASE SET app.settings.* is not allowed on Supabase hosted.
-- Instead, store the Edge Function URL + auth key in a config table that
-- notify_user() reads via SECURITY DEFINER (bypasses RLS).

-- ── 1. Config table (RLS-locked — no client can read) ───────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
-- No policies = nobody can SELECT/INSERT/UPDATE/DELETE via client.
-- Only SECURITY DEFINER functions (like notify_user) can access it.

-- Insert the Supabase project URL (public, safe to store)
INSERT INTO app_config (key, value)
VALUES ('supabase_url', 'https://ivgfgdyfafuqusrdxzij.supabase.co')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── 2. Update notify_user to read from app_config ───────────────────────────
CREATE OR REPLACE FUNCTION notify_user(
  p_user_id    UUID,
  p_type       notification_type,
  p_title      TEXT,
  p_body       TEXT DEFAULT '',
  p_metadata   JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_notif_id UUID;
  v_edge_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Guard: skip if no recipient
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  -- Insert in-app notification
  INSERT INTO notifications (user_id, type, title, body, metadata)
  VALUES (p_user_id, p_type, p_title, p_body, p_metadata)
  RETURNING id INTO v_notif_id;

  -- Call Edge Function for email (best-effort via pg_net)
  BEGIN
    -- Read config from app_config table (SECURITY DEFINER bypasses RLS)
    SELECT value INTO v_edge_url FROM app_config WHERE key = 'supabase_url';
    SELECT value INTO v_service_key FROM app_config WHERE key = 'service_role_key';

    IF v_edge_url IS NOT NULL AND v_edge_url != ''
       AND v_service_key IS NOT NULL AND v_service_key != '' THEN
      PERFORM net.http_post(
        url    := v_edge_url || '/functions/v1/send-notification',
        body   := jsonb_build_object(
          'notification_id', v_notif_id,
          'user_id', p_user_id,
          'type', p_type::text,
          'title', p_title,
          'body', p_body,
          'metadata', p_metadata
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- pg_net not available or config missing — skip email, in-app still works
    NULL;
  END;

  RETURN v_notif_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
