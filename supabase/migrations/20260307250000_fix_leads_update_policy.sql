-- Fix: restrict leads UPDATE to companies and admins only (was open to all authenticated including drivers)
DROP POLICY IF EXISTS "Authenticated update leads" ON public.leads;
CREATE POLICY "Companies and admins update leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role IN ('company', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role IN ('company', 'admin'))
  );
