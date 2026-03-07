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

    const body = await req.json();
    const { action } = body;

    // ── Create user (no user_id needed) ─────────────────────────────
    if (action === "create_user") {
      const { role, email, password, name, profile_fields } = body;
      if (!email || !password || !role) {
        return json({ error: "email, password, and role are required" }, 400);
      }
      if (!["driver", "company"].includes(role)) {
        return json({ error: "role must be driver or company" }, 400);
      }
      if (password.length < 8) {
        return json({ error: "Password must be at least 8 characters" }, 400);
      }

      // 1. Create auth user (email auto-confirmed)
      const { data: authData, error: createErr } =
        await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: name || email, role },
        });
      if (createErr) throw createErr;
      const newUserId = authData.user.id;

      // 2. The handle_new_user trigger creates profiles row.
      //    Use upsert to avoid race condition if trigger hasn't fired yet.
      await supabase
        .from("profiles")
        .upsert({ id: newUserId, role, name: name || email }, { onConflict: "id" });

      // 3. Create the extended profile row
      const pf = profile_fields || {};
      if (role === "company") {
        await supabase.from("company_profiles").upsert({
          id: newUserId,
          company_name: pf.company_name || name || "",
          email: pf.company_email || email,
          phone: pf.phone || null,
          address: pf.address || null,
          website: pf.website || null,
          contact_name: pf.contact_name || name || "",
        }, { onConflict: "id" });
      } else {
        await supabase.from("driver_profiles").upsert({
          id: newUserId,
          first_name: pf.first_name || "",
          last_name: pf.last_name || "",
          phone: pf.phone || null,
          license_state: pf.license_state || null,
          years_exp: pf.years_exp || null,
          license_class: pf.license_class || null,
        }, { onConflict: "id" });
      }

      return json({
        success: true,
        action: "created",
        user_id: newUserId,
        name: name || email,
      });
    }

    // ── All other actions require user_id ───────────────────────────
    const { user_id } = body;
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
        if (banErr) {
          console.error("Auth ban failed:", banErr.message);
          return json({ error: `Profile banned but auth ban failed: ${banErr.message}` }, 500);
        }

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
        if (unbanErr) {
          console.error("Auth unban failed:", unbanErr.message);
          return json({ error: `Profile unbanned but auth unban failed: ${unbanErr.message}` }, 500);
        }

        return json({ success: true, action: "unbanned", user: targetProfile.name });
      }

      case "delete": {
        // Delete related data — collect errors but continue cascade
        const cascadeErrors: string[] = [];
        for (const del of [
          supabase.from("notifications").delete().eq("user_id", user_id),
          supabase.from("saved_jobs").delete().eq("driver_id", user_id),
          supabase.from("ai_match_feedback").delete().eq("driver_id", user_id),
          supabase.from("ai_match_results").delete().eq("driver_id", user_id),
          supabase.from("ai_match_profiles").delete().eq("driver_id", user_id),
          supabase.from("applications").delete().eq("driver_id", user_id),
          supabase.from("applications").delete().eq("company_id", user_id),
          supabase.from("leads").delete().eq("company_id", user_id),
          supabase.from("verification_requests").delete().eq("company_id", user_id),
          supabase.from("jobs").delete().eq("company_id", user_id),
          supabase.from("subscriptions").delete().eq("company_id", user_id),
          supabase.from("driver_profiles").delete().eq("id", user_id),
          supabase.from("company_profiles").delete().eq("id", user_id),
          supabase.from("profiles").delete().eq("id", user_id),
        ]) {
          const { error: delCascadeErr } = await del;
          if (delCascadeErr) cascadeErrors.push(delCascadeErr.message);
        }

        // Delete auth user last
        const { error: delErr } = await supabase.auth.admin.deleteUser(user_id);
        if (delErr) {
          console.error("Auth delete failed:", delErr.message);
          return json({ error: `Auth delete failed: ${delErr.message}`, cascade_errors: cascadeErrors }, 500);
        }
        if (cascadeErrors.length > 0) {
          console.error("Cascade delete warnings:", cascadeErrors);
        }

        return json({ success: true, action: "deleted", user: targetProfile.name, cascade_warnings: cascadeErrors.length > 0 ? cascadeErrors : undefined });
      }

      case "edit_user": {
        const { fields } = body;
        if (!fields || typeof fields !== "object") {
          return json({ error: "fields object required for edit_user" }, 400);
        }

        // Update profiles.name if provided
        if (fields.name) {
          await supabase
            .from("profiles")
            .update({ name: fields.name })
            .eq("id", user_id);
        }

        // Update auth email if changed
        if (fields.email) {
          const { error: emailErr } =
            await supabase.auth.admin.updateUserById(user_id, {
              email: fields.email,
            });
          if (emailErr) {
            return json({ error: `Email update failed: ${emailErr.message}` }, 500);
          }
          // Also update profiles.email if it exists
          await supabase
            .from("profiles")
            .update({ email: fields.email })
            .eq("id", user_id);
        }

        // Update auth password if provided
        if (fields.password) {
          if (typeof fields.password !== "string" || fields.password.length < 8) {
            return json({ error: "Password must be at least 8 characters" }, 400);
          }
          const { error: pwErr } =
            await supabase.auth.admin.updateUserById(user_id, {
              password: fields.password,
            });
          if (pwErr) throw pwErr;
        }

        // Update company_profiles if user is a company
        if (targetProfile.role === "company") {
          const companyUpdate: Record<string, unknown> = {};
          if (fields.company_name !== undefined) companyUpdate.company_name = fields.company_name;
          if (fields.phone !== undefined) companyUpdate.phone = fields.phone;
          if (fields.company_email !== undefined) companyUpdate.email = fields.company_email;
          if (fields.address !== undefined) companyUpdate.address = fields.address;
          if (fields.website !== undefined) companyUpdate.website = fields.website;
          if (fields.contact_name !== undefined) companyUpdate.contact_name = fields.contact_name;
          if (fields.contact_title !== undefined) companyUpdate.contact_title = fields.contact_title;
          if (fields.company_goal !== undefined) companyUpdate.company_goal = fields.company_goal;
          if (fields.about !== undefined) companyUpdate.about = fields.about;

          if (Object.keys(companyUpdate).length > 0) {
            await supabase
              .from("company_profiles")
              .update(companyUpdate)
              .eq("id", user_id);
          }
        }

        // Update driver_profiles if user is a driver
        if (targetProfile.role === "driver") {
          const driverUpdate: Record<string, unknown> = {};
          if (fields.first_name !== undefined) driverUpdate.first_name = fields.first_name;
          if (fields.last_name !== undefined) driverUpdate.last_name = fields.last_name;
          if (fields.phone !== undefined) driverUpdate.phone = fields.phone;
          if (fields.license_state !== undefined) driverUpdate.license_state = fields.license_state;
          if (fields.years_exp !== undefined) driverUpdate.years_exp = fields.years_exp;
          if (fields.license_class !== undefined) driverUpdate.license_class = fields.license_class;
          if (fields.driver_type !== undefined) driverUpdate.driver_type = fields.driver_type;
          if (fields.cdl_number !== undefined) driverUpdate.cdl_number = fields.cdl_number;
          if (fields.zip_code !== undefined) driverUpdate.zip_code = fields.zip_code;
          if (fields.date_of_birth !== undefined) driverUpdate.date_of_birth = fields.date_of_birth;
          if (fields.home_address !== undefined) driverUpdate.home_address = fields.home_address;
          if (fields.about !== undefined) driverUpdate.about = fields.about;
          if (fields.has_accidents !== undefined) driverUpdate.has_accidents = fields.has_accidents === "true";
          if (fields.wants_contact !== undefined) driverUpdate.wants_contact = fields.wants_contact === "true";

          if (Object.keys(driverUpdate).length > 0) {
            await supabase
              .from("driver_profiles")
              .update(driverUpdate)
              .eq("id", user_id);
          }
        }

        return json({ success: true, action: "edited", user: fields.name || targetProfile.name });
      }

      default:
        return json({ error: "Invalid action. Use: ban, unban, delete, edit_user, create_user" }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ error: message }, 500);
  }
});
