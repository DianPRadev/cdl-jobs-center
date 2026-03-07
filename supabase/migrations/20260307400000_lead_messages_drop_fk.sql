-- Drop the FK from lead_messages.lead_id to leads.id so that companies
-- can also message registered drivers (whose IDs are in profiles, not leads).
-- The column is kept as UUID; application code already validates the recipient exists.
ALTER TABLE public.lead_messages
  DROP CONSTRAINT IF EXISTS lead_messages_lead_id_fkey;
