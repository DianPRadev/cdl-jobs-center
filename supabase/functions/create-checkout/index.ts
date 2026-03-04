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
        JSON.stringify({ error: "Only company accounts can subscribe" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-side allowed price/plan map — prevents arbitrary priceIds from client
    const ALLOWED_PLANS: Record<string, string> = {
      starter:   "price_1T76c2R2CsQTleMKfl2pvNI5",
      growth:    "price_1T76c5R2CsQTleMKcZz1LkGO",
      unlimited: "price_1T76cbR2CsQTleMKZleLxu0c",
    };

    // Parse request body — only accept plan name, derive priceId server-side
    const { plan } = await req.json();
    if (!plan || !ALLOWED_PLANS[plan]) {
      return new Response(
        JSON.stringify({ error: "Invalid plan. Allowed: starter, growth, unlimited" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const priceId = ALLOWED_PLANS[plan];

    // Look up existing stripe_customer_id
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", user.id)
      .maybeSingle();

    let stripeCustomerId = sub?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;

      // Save customer ID to subscriptions table
      await supabase.from("subscriptions").upsert(
        {
          company_id: user.id,
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      );
    }

    // Only allow redirects to trusted origins.
    const origin = resolveAllowedOrigin(req);

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?tab=subscription&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      metadata: { supabase_user_id: user.id, plan },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan },
      },
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
