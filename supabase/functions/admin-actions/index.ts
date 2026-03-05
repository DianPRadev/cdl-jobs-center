import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth header" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !caller) return json({ error: "Invalid token" }, 401);

    // Check admin role
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Admin access required" }, 403);
    }

    const { action, user_id } = await req.json();
    if (!user_id) return json({ error: "user_id required" }, 400);

    // Prevent admin from acting on themselves
    if (user_id === caller.id) {
      return json({ error: "Cannot perform this action on yourself" }, 400);
    }

    // Prevent acting on other admins
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("role, name")
      .eq("id", user_id)
      .maybeSingle();

    if (!targetProfile) return json({ error: "User not found" }, 404);
    if (targetProfile.role === "admin") {
      return json({ error: "Cannot perform this action on admin users" }, 403);
    }

    switch (action) {
      case "ban": {
        const { error } = await supabase
          .from("profiles")
          .update({ is_banned: true })
          .eq("id", user_id);
        if (error) throw error;

        // Also disable their auth account so they can't log in
        const { error: banErr } = await supabase.auth.admin.updateUserById(
          user_id,
          { ban_duration: "876000h" } // ~100 years
        );
        if (banErr) console.error("Auth ban failed:", banErr.message);

        return json({ success: true, action: "banned", user: targetProfile.name });
      }

      case "unban": {
        const { error } = await supabase
          .from("profiles")
          .update({ is_banned: false })
          .eq("id", user_id);
        if (error) throw error;

        const { error: unbanErr } = await supabase.auth.admin.updateUserById(
          user_id,
          { ban_duration: "none" }
        );
        if (unbanErr) console.error("Auth unban failed:", unbanErr.message);

        return json({ success: true, action: "unbanned", user: targetProfile.name });
      }

      case "delete": {
        // Delete related data first — must clear all FK references before profiles
        await supabase.from("notifications").delete().eq("user_id", user_id);
        await supabase.from("saved_jobs").delete().eq("driver_id", user_id);
        await supabase.from("ai_match_feedback").delete().eq("driver_id", user_id);
        await supabase.from("ai_match_results").delete().eq("driver_id", user_id);
        await supabase.from("ai_match_profiles").delete().eq("driver_id", user_id);
        await supabase.from("applications").delete().eq("driver_id", user_id);
        await supabase.from("applications").delete().eq("company_id", user_id);
        await supabase.from("leads").delete().eq("company_id", user_id);
        await supabase.from("verification_requests").delete().eq("company_id", user_id);
        await supabase.from("jobs").delete().eq("company_id", user_id);
        await supabase.from("subscriptions").delete().eq("company_id", user_id);
        await supabase.from("driver_profiles").delete().eq("id", user_id);
        await supabase.from("company_profiles").delete().eq("id", user_id);
        await supabase.from("profiles").delete().eq("id", user_id);

        // Delete auth user last
        const { error: delErr } = await supabase.auth.admin.deleteUser(user_id);
        if (delErr) console.error("Auth delete failed:", delErr.message);

        return json({ success: true, action: "deleted", user: targetProfile.name });
      }

      default:
        return json({ error: "Invalid action. Use: ban, unban, delete" }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ error: message }, 500);
  }
});
