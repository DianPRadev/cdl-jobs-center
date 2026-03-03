import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildNotificationEmail,
  buildRichBody,
  escapeHtml,
  getCtaForType,
} from "../_shared/email/templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://cdl-jobs-center.vercel.app";

/** Only these types trigger transactional emails */
const EMAIL_ENABLED_TYPES = new Set([
  "new_application",
  "stage_change",
  "new_message",
  "welcome",
  "verification_update",
]);

/** Descriptive email subjects per type (overrides the short in-app title) */
function getEmailSubject(
  type: string,
  metadata: Record<string, unknown>
): string {
  const m = metadata;
  switch (type) {
    case "new_application": {
      const driver = (m.driver_name as string) || "A driver";
      const job = (m.job_title as string) || "your position";
      return `New Application: ${driver} applied for ${job}`;
    }
    case "stage_change": {
      const stage = (m.new_stage as string) || "updated";
      const job = (m.job_title as string) || "a position";
      return `Application Update: Your ${job} application moved to "${stage}"`;
    }
    case "new_message": {
      const sender = (m.sender_name as string) || "Someone";
      return `New Message from ${sender} - CDL Jobs Center`;
    }
    case "welcome":
      return "Welcome to CDL Jobs Center - Let's Get Started!";
    case "verification_update": {
      const decision = (m.decision as string) || "";
      return decision === "approved"
        ? "Your Company Has Been Verified - CDL Jobs Center"
        : "Verification Update - CDL Jobs Center";
    }
    default:
      return "CDL Jobs Center Notification";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Require service role key — this function is internal only (called by DB triggers via pg_net)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || token !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const {
      user_id,
      type,
      title,
      body,
      metadata = {},
    } = await req.json();

    if (!user_id || !type || !title) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Only send emails for enabled notification types
    if (!EMAIL_ENABLED_TYPES.has(type)) {
      console.log(`Email not enabled for type "${type}" — skipping`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "type_not_email_enabled" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
    if (!brevoApiKey || !senderEmail) {
      console.log("BREVO_API_KEY or BREVO_SENDER_EMAIL not set — skipping email");
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_api_key" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch user profile + notification preferences
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("name, role, notification_preferences")
      .eq("id", user_id)
      .single();

    if (profileErr || !profile) {
      console.error("Profile not found for user:", user_id);
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_profile" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check email preference for this notification type
    const prefs = (profile.notification_preferences ?? {}) as Record<
      string,
      boolean
    >;
    if (prefs[type] === false) {
      console.log(`Email preference disabled for ${type}, user ${user_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "preference_disabled" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get user email from auth
    const {
      data: { user: authUser },
      error: authErr,
    } = await supabase.auth.admin.getUserById(user_id);

    if (authErr || !authUser?.email) {
      console.error("Auth user not found:", user_id);
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_email" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build rich email content
    const { ctaText, ctaUrl } = getCtaForType(type, metadata);
    const dashPath = profile.role === "driver" ? "/driver-dashboard" : "/dashboard";
    const preferencesUrl = `${SITE_URL}${dashPath}?tab=profile`;
    const subject = getEmailSubject(type, metadata);
    const bodyHtml = buildRichBody(type, title, body, metadata);

    const html = buildNotificationEmail({
      title,
      bodyHtml,
      ctaText,
      ctaUrl,
      preferencesUrl,
    });

    // Send via Brevo
    const emailRes = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "CDL Jobs Center", email: senderEmail },
        to: [{ email: authUser.email }],
        subject,
        htmlContent: html,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Brevo API error:", emailRes.status, errBody);
      return new Response(
        JSON.stringify({ error: "email_send_failed", detail: errBody }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await emailRes.json();
    console.log(`Email sent for ${type} to ${authUser.email}:`, result.messageId);

    return new Response(
      JSON.stringify({ sent: true, message_id: result.messageId }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("send-notification error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
