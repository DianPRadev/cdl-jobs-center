/**
 * refresh-my-matches — Computes driver↔job match scores inline for the
 * calling driver, then returns immediately. Also queues a background
 * recompute for semantic/embedding enrichment later.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeDriverJobRulesScore,
  normalizeRouteType,
  buildDriverText,
  buildJobText,
  type DriverFeatures,
  type JobFeatures,
} from "../_shared/scoring/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RULES_RAW_MAX = 90;
const RULES_WEIGHT_MAX = 70;
const BEHAVIOR_WEIGHT_MAX = 10;
const DRIVER_PROFILE_FIELD_COUNT = 9;

const MATCH_ACTIONS = {
  canApply: true,
  canSave: true,
  feedback: ["helpful", "not_relevant", "hide"],
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

type DriverFeedbackValue = "helpful" | "not_relevant" | "hide";
type DriverConfidence = "high" | "medium" | "low";

function deriveMissingFields(driver: DriverFeatures): string[] {
  const missing: string[] = [];
  if (!driver.driverType) missing.push("driver type");
  if (!driver.licenseClass) missing.push("license class");
  if (!driver.yearsExp) missing.push("years of experience");
  if (!driver.licenseState) missing.push("license state");
  if (!driver.zipCode) missing.push("zip code");
  if (!driver.about) missing.push("about me");
  if (!Object.values(driver.routePrefs).some(Boolean)) missing.push("route preferences");
  if (!Object.values(driver.haulerExperience).some(Boolean)) missing.push("freight experience");
  if (!Object.values(driver.endorsements).some(Boolean)) missing.push("endorsements");
  return missing.slice(0, DRIVER_PROFILE_FIELD_COUNT);
}

function deriveConfidence(
  missingFields: string[],
  behaviorScore: number,
): DriverConfidence {
  const completeness = clamp(
    (DRIVER_PROFILE_FIELD_COUNT - missingFields.length) / DRIVER_PROFILE_FIELD_COUNT,
    0,
    1,
  );
  const signalQuality = behaviorScore >= 4 ? 1 : 0;
  if (completeness >= 0.78 && signalQuality >= 1) return "high";
  if (completeness >= 0.42 || signalQuality >= 1) return "medium";
  return "low";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDriverFeatures(profile: Record<string, any>, application: Record<string, any> | null): DriverFeatures {
  return {
    driverId: profile.id,
    driverType: profile.driver_type ?? application?.driver_type ?? null,
    licenseClass: profile.license_class ?? application?.license_class ?? null,
    yearsExp: profile.years_exp ?? application?.years_exp ?? null,
    licenseState: profile.license_state ?? application?.license_state ?? null,
    zipCode: profile.zip_code ?? application?.zip_code ?? null,
    about: profile.about ?? null,
    soloTeam: application?.solo_team ?? null,
    endorsements: (application?.endorse as Record<string, boolean>) ?? {},
    haulerExperience: (application?.hauler as Record<string, boolean>) ?? {},
    routePrefs: (application?.route as Record<string, boolean>) ?? {},
    textBlock: buildDriverText(profile, application),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJobFeatures(jobRow: Record<string, any>): JobFeatures {
  return {
    jobId: jobRow.id,
    companyId: jobRow.company_id,
    title: jobRow.title ?? "",
    description: jobRow.description ?? "",
    driverType: jobRow.driver_type ?? null,
    routeType: jobRow.route_type ?? null,
    freightType: jobRow.type ?? null,
    teamDriving: jobRow.team_driving ?? null,
    location: jobRow.location ?? null,
    pay: jobRow.pay ?? null,
    status: jobRow.status ?? "Active",
    textBlock: buildJobText(jobRow),
  };
}

type SupabaseClient = ReturnType<typeof createClient>;

interface BehaviorContext {
  feedbackByJob: Map<string, DriverFeedbackValue>;
  hiddenJobIds: Set<string>;
  positiveCompanyIds: Set<string>;
  positiveRouteTypes: Set<string>;
  jobEventBoost: Map<string, number>;
}

async function getDriverBehaviorContext(
  supabase: SupabaseClient,
  driverId: string,
): Promise<BehaviorContext> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: feedbackRows }, { data: eventRows }] = await Promise.all([
    supabase
      .from("driver_match_feedback")
      .select("job_id, feedback")
      .eq("driver_id", driverId),
    supabase
      .from("driver_match_events")
      .select("job_id, event_type, jobs(company_id, route_type)")
      .eq("driver_id", driverId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const feedbackByJob = new Map<string, DriverFeedbackValue>();
  const hiddenJobIds = new Set<string>();
  const helpfulJobIds: string[] = [];

  for (const row of feedbackRows ?? []) {
    const feedback = row.feedback as DriverFeedbackValue;
    feedbackByJob.set(row.job_id as string, feedback);
    if (feedback === "hide") hiddenJobIds.add(row.job_id as string);
    if (feedback === "helpful") helpfulJobIds.push(row.job_id as string);
  }

  const positiveCompanyIds = new Set<string>();
  const positiveRouteTypes = new Set<string>();
  const jobEventBoost = new Map<string, number>();

  for (const row of eventRows ?? []) {
    const jobId = row.job_id as string;
    const eventType = row.event_type as string;
    const jobMeta = row.jobs as { company_id?: string; route_type?: string } | null;

    const increment =
      eventType === "apply" ? 3 : eventType === "save" ? 2 : eventType === "click" ? 1 : 0;
    if (increment > 0) {
      const next = (jobEventBoost.get(jobId) ?? 0) + increment;
      jobEventBoost.set(jobId, Math.min(6, next));
    }

    if (eventType === "save" || eventType === "apply") {
      if (jobMeta?.company_id) positiveCompanyIds.add(jobMeta.company_id);
      const routeType = normalizeRouteType(jobMeta?.route_type ?? null);
      if (routeType) positiveRouteTypes.add(routeType);
    }
  }

  if (helpfulJobIds.length > 0) {
    const { data: helpfulJobs } = await supabase
      .from("jobs")
      .select("id, company_id, route_type")
      .in("id", helpfulJobIds);

    for (const row of helpfulJobs ?? []) {
      if (row.company_id) positiveCompanyIds.add(row.company_id as string);
      const routeType = normalizeRouteType((row.route_type as string | null) ?? null);
      if (routeType) positiveRouteTypes.add(routeType);
    }
  }

  return {
    feedbackByJob,
    hiddenJobIds,
    positiveCompanyIds,
    positiveRouteTypes,
    jobEventBoost,
  };
}

function computeBehaviorScore(
  jobRow: Record<string, unknown>,
  context: BehaviorContext,
): { score: number; hidden: boolean; detail: string; caution?: string; reason?: string } {
  const jobId = String(jobRow.id ?? "");
  const companyId = String(jobRow.company_id ?? "");
  const routeTypeValue =
    typeof jobRow.route_type === "string" ? jobRow.route_type : null;

  const feedback = context.feedbackByJob.get(jobId);
  if (feedback === "hide") {
    return { score: 0, hidden: true, detail: "Driver marked this match as hidden.", caution: "Hidden by your prior feedback." };
  }

  let score = 0;
  const details: string[] = [];

  const interactionBoost = context.jobEventBoost.get(jobId) ?? 0;
  if (interactionBoost > 0) {
    score += Math.min(4, interactionBoost);
    details.push(`Recent interactions +${Math.min(4, interactionBoost)}`);
  }

  if (companyId && context.positiveCompanyIds.has(companyId)) {
    score += 2;
    details.push("Company affinity +2");
  }

  const routeType = normalizeRouteType(routeTypeValue);
  if (routeType && context.positiveRouteTypes.has(routeType)) {
    score += 1;
    details.push("Route affinity +1");
  }

  if (feedback === "helpful") {
    score += 4;
    details.push("Marked helpful +4");
  } else if (feedback === "not_relevant") {
    score -= 5;
    details.push("Marked not relevant");
  }

  return {
    score: clamp(Math.round(score), 0, BEHAVIOR_WEIGHT_MAX),
    hidden: false,
    detail: details.length > 0 ? details.join("; ") : "No behavior signal yet.",
    caution: feedback === "not_relevant" ? "You marked this job as not relevant." : undefined,
    reason: feedback === "helpful" ? "You marked this job as helpful before." : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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

    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profileRow || profileRow.role !== "driver") {
      return new Response(JSON.stringify({ error: "Driver access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Compute matches inline ───────────────────────────────

    // 1. Fetch driver profile
    const { data: driverProfile } = await supabase
      .from("driver_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (!driverProfile) {
      return new Response(
        JSON.stringify({ ok: true, matched: 0, message: "No driver profile found. Complete your profile first." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Fetch most recent application for enrichment
    const { data: latestApp } = await supabase
      .from("applications")
      .select("*")
      .eq("driver_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const driverFeatures = extractDriverFeatures(driverProfile, latestApp);
    const missingFields = deriveMissingFields(driverFeatures);
    const behaviorContext = await getDriverBehaviorContext(supabase, user.id);

    // 3. Fetch all active jobs
    const { data: jobs } = await supabase
      .from("jobs")
      .select("*")
      .eq("status", "Active");

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, matched: 0, message: "No active jobs available to match." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Score against each active job (rules-only for speed)
    const upsertRows = [];
    for (const jobRow of jobs) {
      if (behaviorContext.hiddenJobIds.has(jobRow.id as string)) continue;

      const jobFeatures = extractJobFeatures(jobRow);
      const result = computeDriverJobRulesScore(driverFeatures, jobFeatures);
      const behavior = computeBehaviorScore(jobRow, behaviorContext);
      if (behavior.hidden) continue;

      const normalizedRulesScore = clamp(
        Math.round((result.rulesScore / RULES_RAW_MAX) * RULES_WEIGHT_MAX),
        0,
        RULES_WEIGHT_MAX,
      );
      const overall = clamp(normalizedRulesScore + behavior.score, 0, 100);
      const confidence = deriveConfidence(missingFields, behavior.score);

      const topReasons = [...result.topReasons];
      if (behavior.reason) topReasons.push({ text: behavior.reason, positive: true });

      const cautions = [...result.cautions];
      if (behavior.caution) cautions.push({ text: behavior.caution, positive: false });

      const scoreBreakdown = {
        ...result.scoreBreakdown,
        rulesNormalized: {
          score: normalizedRulesScore,
          maxScore: RULES_WEIGHT_MAX,
          detail: `Normalized from raw rules score ${result.rulesScore}/${RULES_RAW_MAX}.`,
        },
        semantic: {
          score: 0,
          maxScore: 20,
          detail: "Semantic scoring pending background enrichment.",
        },
        behavior: {
          score: behavior.score,
          maxScore: BEHAVIOR_WEIGHT_MAX,
          detail: behavior.detail,
        },
      };

      upsertRows.push({
        driver_id: user.id,
        job_id: jobRow.id,
        overall_score: overall,
        rules_score: normalizedRulesScore,
        semantic_score: null,
        behavior_score: behavior.score,
        confidence,
        missing_fields: missingFields,
        actions: MATCH_ACTIONS,
        score_breakdown: scoreBreakdown,
        top_reasons: topReasons.slice(0, 4),
        cautions: cautions.slice(0, 2),
        degraded_mode: true,
        provider: null,
        model: null,
        computed_at: new Date().toISOString(),
        version: 2,
      });
    }

    // 5. Upsert scores
    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("driver_job_match_scores")
        .upsert(upsertRows, { onConflict: "driver_id,job_id" });

      if (upsertError) {
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 6. Clean up hidden jobs
    if (behaviorContext.hiddenJobIds.size > 0) {
      await supabase
        .from("driver_job_match_scores")
        .delete()
        .eq("driver_id", user.id)
        .in("job_id", Array.from(behaviorContext.hiddenJobIds));
    }

    // 7. Also queue background enrichment (semantic/embedding scoring)
    const { data: pendingRow } = await supabase
      .from("matching_recompute_queue")
      .select("id")
      .eq("entity_type", "driver_profile")
      .eq("entity_id", user.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (!pendingRow) {
      await supabase
        .from("matching_recompute_queue")
        .insert({
          entity_type: "driver_profile",
          entity_id: user.id,
          reason: "manual_refresh_enrichment",
          status: "pending",
        });
    }

    return new Response(
      JSON.stringify({ ok: true, matched: upsertRows.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
