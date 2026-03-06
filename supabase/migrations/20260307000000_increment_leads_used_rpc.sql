-- RPC: atomically increment leads_used for a company's subscription
CREATE OR REPLACE FUNCTION increment_leads_used(p_company_id UUID)
RETURNS VOID AS $$
  UPDATE subscriptions
  SET leads_used = leads_used + 1
  WHERE company_id = p_company_id;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER;
