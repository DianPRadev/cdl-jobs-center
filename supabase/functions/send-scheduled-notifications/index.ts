import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildNotificationEmail, escapeHtml } from "../_shared/email/templates.ts";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://cdl-jobs-center.vercel.app";

/** Send email via Brevo. Returns true if sent, false if skipped/failed. */
async function sendEmail(
  brevoApiKey: string,
  senderEmail: string,
  toEmail: string,
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "CDL Jobs Center", email: senderEmail },
        to: [{ email: toEmail }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      console.error("Brevo error:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email send error:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Require service role key — this function is internal only (called by pg_cron)
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
    const { task } = await req.json().catch(() => ({ task: "all" }));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
    const canEmail = !!(brevoApiKey && senderEmail);
    const results: Record<string, number> = {};

    // ── Weekly Digest (Monday 8am CT) ──
    if (task === "all" || task === "weekly_digest") {
      let digestCount = 0;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, role, notification_preferences");

      for (const profile of profiles ?? []) {
        const prefs = (profile.notification_preferences ?? {}) as Record<string, boolean>;
        if (prefs.weekly_digest === false) continue;

        const userId = profile.id as string;
        const role = profile.role as string;
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const col = role === "driver" ? "driver_id" : "company_id";
        const { count: appCount } = await supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq(col, userId)
          .gte("submitted_at", oneWeekAgo);

        const { data: userApps } = await supabase
          .from("applications")
          .select("id")
          .eq(col, userId);
        const appIds = (userApps ?? []).map((a) => a.id);

        let msgCount = 0;
        if (appIds.length > 0) {
          const { count } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .in("application_id", appIds)
            .gte("created_at", oneWeekAgo);
          msgCount = count ?? 0;
        }

        if ((appCount ?? 0) === 0 && msgCount === 0) continue;

        const dashLink = role === "driver" ? "/driver-dashboard" : "/dashboard";
        const title = "Your Weekly Activity Summary";
        const body = role === "driver"
          ? `This week: ${appCount ?? 0} application update${(appCount ?? 0) !== 1 ? "s" : ""}, ${msgCount} new message${msgCount !== 1 ? "s" : ""}.`
          : `This week: ${appCount ?? 0} new application${(appCount ?? 0) !== 1 ? "s" : ""}, ${msgCount} new message${msgCount !== 1 ? "s" : ""}.`;

        await supabase.from("notifications").insert({
          user_id: userId,
          type: "weekly_digest",
          title,
          body,
          metadata: { link: dashLink },
        });

        if (canEmail) {
          const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
          if (authUser?.email) {
            const html = buildNotificationEmail({
              title,
              bodyHtml: escapeHtml(body),
              ctaText: "View Dashboard",
              ctaUrl: `${SITE_URL}${dashLink}`,
              preferencesUrl: `${SITE_URL}${dashLink}?tab=profile`,
            });
            await sendEmail(brevoApiKey!, senderEmail!, authUser.email, title, html);
          }
        }
        digestCount++;
      }
      results.weekly_digest = digestCount;
    }

    // ── Profile Completion Reminder (daily 10am CT) ──
    if (task === "all" || task === "profile_reminder") {
      let reminderCount = 0;
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({
        perPage: 1000,
      });

      for (const authUser of authUsers ?? []) {
        if (!authUser.created_at || authUser.created_at > threeDaysAgo) continue;
        if (!authUser.email) continue;

        const userId = authUser.id;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, notification_preferences")
          .eq("id", userId)
          .single();

        if (!profile || profile.role !== "driver") continue;

        const prefs = (profile.notification_preferences ?? {}) as Record<string, boolean>;
        if (prefs.profile_reminder === false) continue;

        const { data: driverProfile } = await supabase
          .from("driver_profiles")
          .select("phone, cdl_number")
          .eq("id", userId)
          .single();

        if (driverProfile?.phone && driverProfile?.cdl_number) continue;

        const { count: recentReminder } = await supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("type", "profile_reminder")
          .gte("created_at", sevenDaysAgo);

        if ((recentReminder ?? 0) > 0) continue;

        const title = "Complete Your Driver Profile";
        const body = "A complete profile helps you get matched with better jobs and makes applying faster.";

        await supabase.from("notifications").insert({
          user_id: userId,
          type: "profile_reminder",
          title,
          body,
          metadata: { link: "/driver-dashboard?tab=profile" },
        });

        if (canEmail) {
          const html = buildNotificationEmail({
            title,
            bodyHtml: escapeHtml(body),
            ctaText: "Complete Profile",
            ctaUrl: `${SITE_URL}/driver-dashboard?tab=profile`,
            preferencesUrl: `${SITE_URL}/driver-dashboard?tab=profile`,
          });
          await sendEmail(brevoApiKey!, senderEmail!, authUser.email, title, html);
        }
        reminderCount++;
      }
      results.profile_reminder = reminderCount;
    }

    // ── Lead Quota Warning (daily 9am CT) ──
    if (task === "all" || task === "lead_quota") {
      let quotaCount = 0;

      const { data: subs } = await supabase
        .from("subscriptions")
        .select("company_id, plan, lead_limit, leads_used")
        .gt("lead_limit", 0);

      for (const sub of subs ?? []) {
        if (sub.lead_limit <= 0) continue;
        const usage = (sub.leads_used ?? 0) / sub.lead_limit;
        if (usage < 0.8) continue;

        const userId = sub.company_id as string;

        const { data: profile } = await supabase
          .from("profiles")
          .select("notification_preferences")
          .eq("id", userId)
          .single();

        const prefs = (profile?.notification_preferences ?? {}) as Record<string, boolean>;
        if (prefs.subscription_event === false) continue;

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: recentQuota } = await supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("type", "subscription_event")
          .gte("created_at", oneDayAgo);

        if ((recentQuota ?? 0) > 0) continue;

        const pct = Math.round(usage * 100);
        const title = "Lead Quota Almost Reached";
        const body = `You've used ${sub.leads_used} of ${sub.lead_limit} leads (${pct}%). Upgrade your plan for more leads.`;

        await supabase.from("notifications").insert({
          user_id: userId,
          type: "subscription_event",
          title,
          body,
          metadata: { link: "/pricing", usage: pct },
        });

        if (canEmail) {
          const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
          if (authUser?.email) {
            const html = buildNotificationEmail({
              title,
              bodyHtml: escapeHtml(body),
              ctaText: "Upgrade Plan",
              ctaUrl: `${SITE_URL}/pricing`,
              preferencesUrl: `${SITE_URL}/dashboard?tab=profile`,
            });
            await sendEmail(brevoApiKey!, senderEmail!, authUser.email, title, html);
          }
        }
        quotaCount++;
      }
      results.lead_quota = quotaCount;
    }

    console.log("Scheduled notifications sent:", results);
    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("send-scheduled-notifications error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
