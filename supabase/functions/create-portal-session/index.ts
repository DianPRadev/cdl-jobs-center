import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_ORIGIN = Deno.env.get("SITE_URL") ?? "https://cdl-jobs-center.vercel.app";

const allowedOrigins = (
  Deno.env.get("ALLOWED_ORIGINS") ??
  `${DEFAULT_ORIGIN},http://localhost:8080,http://127.0.0.1:8080`
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const resolveAllowedOrigin = (req: Request) => {
  const requestOrigin = req.headers.get("origin");
  if (!requestOrigin) return DEFAULT_ORIGIN;

  try {
    const normalized = new URL(requestOrigin).origin;
    return allowedOrigins.includes(normalized) ? normalized : DEFAULT_ORIGIN;
  } catch {
    return DEFAULT_ORIGIN;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-12-18.acacia",
    });

    // Verify user via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is a company account
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "company") {
      return new Response(
        JSON.stringify({ error: "Only company accounts can access billing portal" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Look up stripe_customer_id
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", user.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: "No active Stripe subscription found" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json().catch(() => ({})) as { return_origin?: string };
    let origin = DEFAULT_ORIGIN;
    if (body.return_origin) {
      try {
        const normalized = new URL(body.return_origin).origin;
        origin = allowedOrigins.includes(normalized) ? normalized : DEFAULT_ORIGIN;
      } catch {
        origin = resolveAllowedOrigin(req);
      }
    } else {
      origin = resolveAllowedOrigin(req);
    }

    // Create Customer Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/dashboard?tab=subscription`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
