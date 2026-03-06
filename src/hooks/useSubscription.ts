import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type Plan = "free" | "starter" | "growth" | "unlimited";

export interface Subscription {
  id: string;
  companyId: string;
  plan: Plan;
  leadLimit: number;
  leadsUsed: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: "active" | "past_due" | "canceled" | "trialing";
  currentPeriodEnd: string | null;
  createdAt: string;
}

export const PLANS = {
  free:      { label: "Free",      price: 0,   leads: 5,    priceId: "" },
  starter:   { label: "Starter",   price: 39,  leads: 40,   priceId: import.meta.env.VITE_STRIPE_PRICE_STARTER ?? "" },
  growth:    { label: "Growth",    price: 99,  leads: 150,  priceId: import.meta.env.VITE_STRIPE_PRICE_GROWTH ?? "" },
  unlimited: { label: "Unlimited", price: 249, leads: 9999, priceId: import.meta.env.VITE_STRIPE_PRICE_UNLIMITED ?? "" },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSub(row: Record<string, any>): Subscription {
  return {
    id: row.id,
    companyId: row.company_id,
    plan: row.plan ?? "free",
    leadLimit: row.lead_limit ?? 5,
    leadsUsed: row.leads_used ?? 0,
    stripeCustomerId: row.stripe_customer_id ?? null,
    stripeSubscriptionId: row.stripe_subscription_id ?? null,
    status: row.status ?? "active",
    currentPeriodEnd: row.current_period_end ?? null,
    createdAt: row.created_at,
  };
}

/** Get (or auto-create free) the company's subscription */
export function useSubscription(companyId: string | undefined) {
  return useQuery({
    queryKey: ["subscription", companyId],
    refetchOnMount: "always",
    queryFn: async () => {
      // Try to fetch existing
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw new Error(error.message || "Failed to load subscription");
      }

      if (data) return rowToSub(data);

      // No subscription row — create a free one (RLS restricts to plan='free' only)
      const { data: newRow, error: insertErr } = await supabase
        .from("subscriptions")
        .insert({ company_id: companyId!, plan: "free", lead_limit: 5, leads_used: 0 })
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message || "Failed to create subscription");
      return rowToSub(newRow);
    },
    enabled: !!companyId,
  });
}

/** Increment leads_used by 1 when a company contacts a lead */
export function useIncrementLeadsUsed() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.rpc("increment_leads_used", {
        p_company_id: companyId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, companyId) => {
      qc.invalidateQueries({ queryKey: ["subscription", companyId] });
    },
  });
}

/**
 * Cancel subscription — redirects to Stripe billing portal.
 * The portal handles the actual cancellation; the stripe-webhook
 * updates the DB when Stripe fires customer.subscription.deleted.
 */
export function useCancelSubscription() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let res: Response;
      try {
        res = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error("Request timed out. Please try again.");
        }
        throw new Error("Could not reach billing portal. Please try again later.");
      }
      clearTimeout(timeout);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? `Portal request failed (${res.status})`);
      }

      const { url } = await res.json();
      if (!url) throw new Error("No portal URL returned. Please try again.");
      window.location.href = url;
    },
    onSuccess: (_data, companyId) => {
      qc.invalidateQueries({ queryKey: ["subscription", companyId] });
    },
  });
}
