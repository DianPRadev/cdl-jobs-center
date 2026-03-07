-- Fix: free plan lead_limit default was 3, should be 5 to match frontend pricing
ALTER TABLE public.subscriptions ALTER COLUMN lead_limit SET DEFAULT 5;

-- Update existing free-plan rows that still have the old default of 3
UPDATE public.subscriptions
  SET lead_limit = 5
  WHERE plan = 'free' AND lead_limit = 3;
