-- Pipeline leads: companies can add leads to their recruitment pipeline
CREATE TABLE IF NOT EXISTS public.pipeline_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'New' CHECK (stage IN ('New','Reviewing','Interview','Hired','Rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, lead_id)
);

ALTER TABLE public.pipeline_leads ENABLE ROW LEVEL SECURITY;

-- Companies can read their own pipeline leads
CREATE POLICY "Companies read own pipeline leads" ON public.pipeline_leads
  FOR SELECT TO authenticated
  USING (company_id = (select auth.uid()));

-- Companies can insert into their own pipeline
CREATE POLICY "Companies insert own pipeline leads" ON public.pipeline_leads
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (select auth.uid()));

-- Companies can update their own pipeline leads
CREATE POLICY "Companies update own pipeline leads" ON public.pipeline_leads
  FOR UPDATE TO authenticated
  USING (company_id = (select auth.uid()))
  WITH CHECK (company_id = (select auth.uid()));

-- Companies can delete from their own pipeline
CREATE POLICY "Companies delete own pipeline leads" ON public.pipeline_leads
  FOR DELETE TO authenticated
  USING (company_id = (select auth.uid()));

-- Admin can do everything
CREATE POLICY "Admins manage all pipeline leads" ON public.pipeline_leads
  FOR ALL TO authenticated
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));
