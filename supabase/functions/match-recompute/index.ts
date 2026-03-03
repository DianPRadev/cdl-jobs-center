/**
 * match-recompute — Queue processor Edge Function.
 * Claims pending items from matching_recompute_queue and computes match scores.
 * Designed to be called every 5 minutes via pg_cron or external scheduler.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeDriverJobRulesScore,
  computeCompanyDriverRulesScore,
  createEmbeddingProvider,
  cosineSimilarity,
  contentHash,
  buildDriverText,
  buildJobText,
  buildLeadText,
  normalizeRouteType,
  type DriverFeatures,
  type JobFeatures,
  type CandidateFeatures,
  type EmbeddingProvider,
} from "../_shared/scoring/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TIMEOUT_MS = 50_000; // stop processing at 50s (function limit ~60s)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Auth: only allow service-role key or cron secret
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("MATCH_CRON_SECRET");
    const token = authHeader?.replace("Bearer ", "") ?? "";

    const isServiceRole = token === serviceRoleKey;
    const isCronSecret = cronSecret && token === cronSecret;

    if (!isServiceRole && !isCronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Claim a batch of pending queue items
    const { data: batch, error: claimErr } = await supabase.rpc(
      "claim_recompute_batch",
      { batch_size: 20 },
    );

    if (claimErr) {
      return new Response(JSON.stringify({ error: claimErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!batch || batch.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "Queue empty" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const embeddingProvider = createEmbeddingProvider();
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const item of batch) {
      // Timeout guard
      if (Date.now() - startTime > TIMEOUT_MS) {
        // Release unprocessed items back to pending
        await supabase
          .from("matching_recompute_queue")
          .update({ status: "pending", started_at: null })
          .eq("id", item.id)
          .eq("status", "processing");
        skipped++;
        continue;
      }

      try {
        switch (item.entity_type) {
          case "driver_profile":
            await processDriverProfile(supabase, item.entity_id, embeddingProvider);
            break;
          case "job":
            await processJob(supabase, item.entity_id, item.company_id, embeddingProvider);
            break;
          case "application":
            await processApplication(supabase, item.entity_id, item.company_id, embeddingProvider);
            break;
          case "lead":
            await processLead(supabase, item.entity_id, item.company_id, embeddingProvider);
            break;
        }

        // Mark done
        await supabase
          .from("matching_recompute_queue")
          .update({ status: "done", completed_at: new Date().toISOString() })
          .eq("id", item.id);
        succeeded++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const newStatus = item.attempts >= item.max_attempts ? "error" : "pending";

        await supabase
          .from("matching_recompute_queue")
          .update({
            status: newStatus,
            last_error: errorMsg,
            // If going back to pending, schedule retry with backoff
            ...(newStatus === "pending"
              ? { scheduled_at: new Date(Date.now() + item.attempts * 60_000).toISOString() }
              : { completed_at: new Date().toISOString() }),
          })
          .eq("id", item.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ processed: batch.length, succeeded, failed, skipped }),
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

// ── Helpers ────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createClient>;

const RULES_RAW_MAX = 90;
const RULES_WEIGHT_MAX = 70;
const SEMANTIC_WEIGHT_MAX = 20;
const BEHAVIOR_WEIGHT_MAX = 10;
const DRIVER_PROFILE_FIELD_COUNT = 9;
const MATCH_ACTIONS = {
  canApply: true,
  canSave: true,
  feedback: ["helpful", "not_relevant", "hide"],
};

type DriverFeedbackValue = "helpful" | "not_relevant" | "hide";
type DriverConfidence = "high" | "medium" | "low";

interface DriverBehaviorContext {
  feedbackByJob: Map<string, DriverFeedbackValue>;
  hiddenJobIds: Set<string>;
  positiveCompanyIds: Set<string>;
  positiveRouteTypes: Set<string>;
  jobEventBoost: Map<string, number>;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

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
  semanticScore: number | null,
  behaviorScore: number,
): DriverConfidence {
  const completeness = clamp(
    (DRIVER_PROFILE_FIELD_COUNT - missingFields.length) / DRIVER_PROFILE_FIELD_COUNT,
    0,
    1,
  );
  const signalQuality =
    (semanticScore !== null ? 1 : 0) + (behaviorScore >= 4 ? 1 : 0);

  if (completeness >= 0.78 && signalQuality >= 1) return "high";
  if (completeness >= 0.42 || signalQuality >= 1) return "medium";
  return "low";
}

async function getDriverBehaviorContext(
  supabase: SupabaseClient,
  driverId: string,
): Promise<DriverBehaviorContext> {
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
  context: DriverBehaviorContext,
): { score: number; hidden: boolean; detail: string; caution?: string; reason?: string } {
  const jobId = String(jobRow.id ?? "");
  const companyId = String(jobRow.company_id ?? "");
  const routeTypeValue =
    typeof jobRow.route_type === "string" ? jobRow.route_type : null;

  const feedback = context.feedbackByJob.get(jobId);
  if (feedback === "hide") {
    return {
      score: 0,
      hidden: true,
      detail: "Driver marked this match as hidden.",
      caution: "Hidden by your prior feedback.",
    };
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

async function processDriverProfile(
  supabase: SupabaseClient,
  driverId: string,
  embeddingProvider: EmbeddingProvider | null,
) {
  // Fetch driver profile
  const { data: profile, error: profErr } = await supabase
    .from("driver_profiles")
    .select("*")
    .eq("id", driverId)
    .maybeSingle();
  if (profErr || !profile) return;

  // Fetch most recent application for enrichment
  const { data: latestApp } = await supabase
    .from("applications")
    .select("*")
    .eq("driver_id", driverId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const driverFeatures = extractDriverFeatures(profile, latestApp);
  const missingFields = deriveMissingFields(driverFeatures);
  const behaviorContext = await getDriverBehaviorContext(supabase, driverId);

  // Fetch all active jobs
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("status", "Active");
  if (!jobs || jobs.length === 0) return;

  // Get or compute driver embedding
  const driverEmbedding = await getOrComputeEmbedding(
    supabase,
    embeddingProvider,
    "driver",
    driverId,
    driverFeatures.textBlock,
  );

  // Score against each active job
  const upsertRows = [];
  for (const jobRow of jobs) {
    if (behaviorContext.hiddenJobIds.has(jobRow.id as string)) continue;

    const jobFeatures = extractJobFeatures(jobRow);
    const result = computeDriverJobRulesScore(driverFeatures, jobFeatures);
    const behavior = computeBehaviorScore(jobRow, behaviorContext);
    if (behavior.hidden) continue;

    let semanticScore: number | null = null;
    let semanticDetail = "Semantic similarity unavailable (rules-only mode).";

    // Add semantic score if embeddings available
    if (driverEmbedding) {
      const jobEmbedding = await getOrComputeEmbedding(
        supabase,
        embeddingProvider,
        "job",
        jobRow.id,
        jobFeatures.textBlock,
      );
      if (jobEmbedding) {
        const sim = cosineSimilarity(driverEmbedding, jobEmbedding);
        semanticScore = Math.round(clamp(Math.max(0, sim), 0, 1) * SEMANTIC_WEIGHT_MAX);
        semanticDetail = `Embedding similarity contribution (${semanticScore}/${SEMANTIC_WEIGHT_MAX}).`;
      }
    }

    const normalizedRulesScore = clamp(
      Math.round((result.rulesScore / RULES_RAW_MAX) * RULES_WEIGHT_MAX),
      0,
      RULES_WEIGHT_MAX,
    );
    const overall = clamp(
      normalizedRulesScore + (semanticScore ?? 0) + behavior.score,
      0,
      100,
    );
    const degradedMode = semanticScore === null;

    const topReasons = [...result.topReasons];
    if (behavior.reason) topReasons.push({ text: behavior.reason, positive: true });
    if (semanticScore !== null && semanticScore >= 12) {
      topReasons.push({
        text: "Strong semantic similarity between your profile and this job.",
        positive: true,
      });
    }

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
        score: semanticScore ?? 0,
        maxScore: SEMANTIC_WEIGHT_MAX,
        detail: semanticDetail,
      },
      behavior: {
        score: behavior.score,
        maxScore: BEHAVIOR_WEIGHT_MAX,
        detail: behavior.detail,
      },
    };
    const confidence = deriveConfidence(missingFields, semanticScore, behavior.score);

    upsertRows.push({
      driver_id: driverId,
      job_id: jobRow.id,
      overall_score: overall,
      rules_score: normalizedRulesScore,
      semantic_score: semanticScore,
      behavior_score: behavior.score,
      confidence,
      missing_fields: missingFields,
      actions: MATCH_ACTIONS,
      score_breakdown: scoreBreakdown,
      top_reasons: topReasons.slice(0, 4),
      cautions: cautions.slice(0, 2),
      degraded_mode: degradedMode,
      provider: embeddingProvider?.providerName ?? null,
      model: embeddingProvider?.modelName ?? null,
      computed_at: new Date().toISOString(),
      version: 2,
    });
  }

  if (upsertRows.length > 0) {
    await supabase
      .from("driver_job_match_scores")
      .upsert(upsertRows, { onConflict: "driver_id,job_id" });
  }

  if (behaviorContext.hiddenJobIds.size > 0) {
    await supabase
      .from("driver_job_match_scores")
      .delete()
      .eq("driver_id", driverId)
      .in("job_id", Array.from(behaviorContext.hiddenJobIds));
  }
}

async function processJob(
  supabase: SupabaseClient,
  jobId: string,
  companyId: string | null,
  embeddingProvider: EmbeddingProvider | null,
) {
  // Fetch job
  const { data: jobRow, error: jobErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !jobRow) return;

  // Only score active jobs
  if (jobRow.status !== "Active") return;

  const jobFeatures = extractJobFeatures(jobRow);
  const jobEmbedding = await getOrComputeEmbedding(
    supabase,
    embeddingProvider,
    "job",
    jobId,
    jobFeatures.textBlock,
  );

  // Score against all driver profiles
  const { data: drivers } = await supabase
    .from("driver_profiles")
    .select("*");

  if (drivers && drivers.length > 0) {
    const driverRows = [];
    for (const profile of drivers) {
      const { data: latestApp } = await supabase
        .from("applications")
        .select("*")
        .eq("driver_id", profile.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const driverFeatures = extractDriverFeatures(profile, latestApp);
      const missingFields = deriveMissingFields(driverFeatures);
      const behaviorContext = await getDriverBehaviorContext(supabase, profile.id as string);
      if (behaviorContext.hiddenJobIds.has(jobId)) continue;

      const result = computeDriverJobRulesScore(driverFeatures, jobFeatures);
      const behavior = computeBehaviorScore(jobRow, behaviorContext);
      if (behavior.hidden) continue;

      let semanticScore: number | null = null;
      let semanticDetail = "Semantic similarity unavailable (rules-only mode).";

      if (jobEmbedding) {
        const driverEmb = await getOrComputeEmbedding(
          supabase,
          embeddingProvider,
          "driver",
          profile.id,
          driverFeatures.textBlock,
        );
        if (driverEmb) {
          const sim = cosineSimilarity(driverEmb, jobEmbedding);
          semanticScore = Math.round(clamp(Math.max(0, sim), 0, 1) * SEMANTIC_WEIGHT_MAX);
          semanticDetail = `Embedding similarity contribution (${semanticScore}/${SEMANTIC_WEIGHT_MAX}).`;
        }
      }

      const normalizedRulesScore = clamp(
        Math.round((result.rulesScore / RULES_RAW_MAX) * RULES_WEIGHT_MAX),
        0,
        RULES_WEIGHT_MAX,
      );
      const overall = clamp(
        normalizedRulesScore + (semanticScore ?? 0) + behavior.score,
        0,
        100,
      );
      const degradedMode = semanticScore === null;
      const confidence = deriveConfidence(missingFields, semanticScore, behavior.score);

      const topReasons = [...result.topReasons];
      if (behavior.reason) topReasons.push({ text: behavior.reason, positive: true });
      if (semanticScore !== null && semanticScore >= 12) {
        topReasons.push({
          text: "Strong semantic similarity between your profile and this job.",
          positive: true,
        });
      }

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
          score: semanticScore ?? 0,
          maxScore: SEMANTIC_WEIGHT_MAX,
          detail: semanticDetail,
        },
        behavior: {
          score: behavior.score,
          maxScore: BEHAVIOR_WEIGHT_MAX,
          detail: behavior.detail,
        },
      };

      driverRows.push({
        driver_id: profile.id,
        job_id: jobId,
        overall_score: overall,
        rules_score: normalizedRulesScore,
        semantic_score: semanticScore,
        behavior_score: behavior.score,
        confidence,
        missing_fields: missingFields,
        actions: MATCH_ACTIONS,
        score_breakdown: scoreBreakdown,
        top_reasons: topReasons.slice(0, 4),
        cautions: cautions.slice(0, 2),
        degraded_mode: degradedMode,
        provider: embeddingProvider?.providerName ?? null,
        model: embeddingProvider?.modelName ?? null,
        computed_at: new Date().toISOString(),
        version: 2,
      });
    }

    if (driverRows.length > 0) {
      await supabase
        .from("driver_job_match_scores")
        .upsert(driverRows, { onConflict: "driver_id,job_id" });
    }
  }

  // Also score company's candidates against this job
  if (companyId) {
    await scoreCompanyCandidatesForJob(supabase, companyId, jobId, jobFeatures, jobEmbedding, embeddingProvider);
  }
}

async function processApplication(
  supabase: SupabaseClient,
  applicationId: string,
  companyId: string | null,
  embeddingProvider: EmbeddingProvider | null,
) {
  if (!companyId) return;

  const { data: app } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return;

  // Fetch company's active jobs
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "Active");
  if (!jobs || jobs.length === 0) return;

  const candidate = extractCandidateFromApplication(app);

  for (const jobRow of jobs) {
    const jobFeatures = extractJobFeatures(jobRow);
    const result = computeCompanyDriverRulesScore(candidate, jobFeatures);

    // Semantic
    if (embeddingProvider) {
      const candEmb = await getOrComputeEmbedding(supabase, embeddingProvider, "application", applicationId, candidate.textBlock);
      const jobEmb = await getOrComputeEmbedding(supabase, embeddingProvider, "job", jobRow.id, jobFeatures.textBlock);
      if (candEmb && jobEmb) {
        const sim = cosineSimilarity(candEmb, jobEmb);
        result.semanticScore = Math.round(Math.max(0, sim) * 10);
        result.overallScore = result.rulesScore + result.semanticScore;
      }
    }

    await supabase.from("company_driver_match_scores").upsert(
      {
        company_id: companyId,
        job_id: jobRow.id,
        candidate_source: "application",
        candidate_id: applicationId,
        candidate_driver_id: app.driver_id ?? null,
        overall_score: Math.min(result.overallScore, 100),
        rules_score: result.rulesScore,
        semantic_score: result.semanticScore,
        score_breakdown: result.scoreBreakdown,
        top_reasons: result.topReasons,
        cautions: result.cautions,
        degraded_mode: result.degradedMode,
        provider: embeddingProvider?.providerName ?? null,
        model: embeddingProvider?.modelName ?? null,
        computed_at: new Date().toISOString(),
        version: 1,
      },
      { onConflict: "company_id,job_id,candidate_source,candidate_id" },
    );
  }
}

async function processLead(
  supabase: SupabaseClient,
  leadId: string,
  companyId: string | null,
  embeddingProvider: EmbeddingProvider | null,
) {
  if (!companyId) return;

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "Active");
  if (!jobs || jobs.length === 0) return;

  const candidate = extractCandidateFromLead(lead);

  for (const jobRow of jobs) {
    const jobFeatures = extractJobFeatures(jobRow);
    const result = computeCompanyDriverRulesScore(candidate, jobFeatures);

    if (embeddingProvider) {
      const candEmb = await getOrComputeEmbedding(supabase, embeddingProvider, "lead", leadId, candidate.textBlock);
      const jobEmb = await getOrComputeEmbedding(supabase, embeddingProvider, "job", jobRow.id, jobFeatures.textBlock);
      if (candEmb && jobEmb) {
        const sim = cosineSimilarity(candEmb, jobEmb);
        result.semanticScore = Math.round(Math.max(0, sim) * 10);
        result.overallScore = result.rulesScore + result.semanticScore;
      }
    }

    await supabase.from("company_driver_match_scores").upsert(
      {
        company_id: companyId,
        job_id: jobRow.id,
        candidate_source: "lead",
        candidate_id: leadId,
        candidate_driver_id: null,
        overall_score: Math.min(result.overallScore, 100),
        rules_score: result.rulesScore,
        semantic_score: result.semanticScore,
        score_breakdown: result.scoreBreakdown,
        top_reasons: result.topReasons,
        cautions: result.cautions,
        degraded_mode: result.degradedMode,
        provider: embeddingProvider?.providerName ?? null,
        model: embeddingProvider?.modelName ?? null,
        computed_at: new Date().toISOString(),
        version: 1,
      },
      { onConflict: "company_id,job_id,candidate_source,candidate_id" },
    );
  }
}

// ── Score company candidates for a specific job ────────────

async function scoreCompanyCandidatesForJob(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  jobFeatures: JobFeatures,
  jobEmbedding: number[] | null,
  embeddingProvider: EmbeddingProvider | null,
) {
  // Applications
  const { data: apps } = await supabase
    .from("applications")
    .select("*")
    .eq("company_id", companyId);

  if (apps) {
    for (const app of apps) {
      const candidate = extractCandidateFromApplication(app);
      const result = computeCompanyDriverRulesScore(candidate, jobFeatures);

      if (jobEmbedding && embeddingProvider) {
        const candEmb = await getOrComputeEmbedding(supabase, embeddingProvider, "application", app.id, candidate.textBlock);
        if (candEmb) {
          const sim = cosineSimilarity(candEmb, jobEmbedding);
          result.semanticScore = Math.round(Math.max(0, sim) * 10);
          result.overallScore = result.rulesScore + result.semanticScore;
        }
      }

      await supabase.from("company_driver_match_scores").upsert(
        {
          company_id: companyId,
          job_id: jobId,
          candidate_source: "application",
          candidate_id: app.id,
          candidate_driver_id: app.driver_id ?? null,
          overall_score: Math.min(result.overallScore, 100),
          rules_score: result.rulesScore,
          semantic_score: result.semanticScore,
          score_breakdown: result.scoreBreakdown,
          top_reasons: result.topReasons,
          cautions: result.cautions,
          degraded_mode: result.degradedMode,
          provider: embeddingProvider?.providerName ?? null,
          model: embeddingProvider?.modelName ?? null,
          computed_at: new Date().toISOString(),
          version: 1,
        },
        { onConflict: "company_id,job_id,candidate_source,candidate_id" },
      );
    }
  }

  // Leads
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("company_id", companyId);

  if (leads) {
    for (const lead of leads) {
      const candidate = extractCandidateFromLead(lead);
      const result = computeCompanyDriverRulesScore(candidate, jobFeatures);

      if (jobEmbedding && embeddingProvider) {
        const candEmb = await getOrComputeEmbedding(supabase, embeddingProvider, "lead", lead.id, candidate.textBlock);
        if (candEmb) {
          const sim = cosineSimilarity(candEmb, jobEmbedding);
          result.semanticScore = Math.round(Math.max(0, sim) * 10);
          result.overallScore = result.rulesScore + result.semanticScore;
        }
      }

      await supabase.from("company_driver_match_scores").upsert(
        {
          company_id: companyId,
          job_id: jobId,
          candidate_source: "lead",
          candidate_id: lead.id,
          candidate_driver_id: null,
          overall_score: Math.min(result.overallScore, 100),
          rules_score: result.rulesScore,
          semantic_score: result.semanticScore,
          score_breakdown: result.scoreBreakdown,
          top_reasons: result.topReasons,
          cautions: result.cautions,
          degraded_mode: result.degradedMode,
          provider: embeddingProvider?.providerName ?? null,
          model: embeddingProvider?.modelName ?? null,
          computed_at: new Date().toISOString(),
          version: 1,
        },
        { onConflict: "company_id,job_id,candidate_source,candidate_id" },
      );
    }
  }
}

// ── Feature extractors ─────────────────────────────────────

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCandidateFromApplication(app: Record<string, any>): CandidateFeatures {
  return {
    candidateId: app.id,
    source: "application",
    candidateDriverId: app.driver_id ?? null,
    name: `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim(),
    driverType: app.driver_type ?? null,
    licenseClass: app.license_class ?? null,
    yearsExp: app.years_exp ?? null,
    state: app.license_state ?? null,
    soloTeam: app.solo_team ?? null,
    endorsements: (app.endorse as Record<string, boolean>) ?? {},
    haulerExperience: (app.hauler as Record<string, boolean>) ?? {},
    routePrefs: (app.route as Record<string, boolean>) ?? {},
    createdAt: app.submitted_at ?? app.created_at ?? "",
    textBlock: buildDriverText({
      driver_type: app.driver_type,
      license_class: app.license_class,
      years_exp: app.years_exp,
      license_state: app.license_state,
    }, app),
    missingFields: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCandidateFromLead(lead: Record<string, any>): CandidateFeatures {
  const missing: string[] = [];
  if (!lead.years_exp) missing.push("experience");
  if (!lead.state) missing.push("state");
  if (!lead.is_owner_op && lead.is_owner_op !== false) missing.push("driver type");

  return {
    candidateId: lead.id,
    source: "lead",
    candidateDriverId: null,
    name: lead.full_name ?? "",
    driverType: lead.is_owner_op ? "owner-operator" : null,
    licenseClass: null, // leads don't have license info
    yearsExp: lead.years_exp ?? null,
    state: lead.state ?? null,
    soloTeam: null,
    endorsements: {},
    haulerExperience: {},
    routePrefs: {},
    createdAt: lead.created_at ?? "",
    textBlock: buildLeadText(lead),
    missingFields: missing,
  };
}

// ── Embedding cache ────────────────────────────────────────

async function getOrComputeEmbedding(
  supabase: SupabaseClient,
  provider: EmbeddingProvider | null,
  entityType: string,
  entityId: string,
  text: string,
): Promise<number[] | null> {
  if (!provider || !text.trim()) return null;

  const hash = contentHash(text);

  // Check cache
  const { data: cached } = await supabase
    .from("matching_text_embeddings")
    .select("embedding, content_hash")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (cached && cached.content_hash === hash) {
    return cached.embedding as number[];
  }

  // Compute new embedding
  try {
    const [embedding] = await provider.embed([text]);

    // Cache it
    await supabase.from("matching_text_embeddings").upsert(
      {
        entity_type: entityType,
        entity_id: entityId,
        content_hash: hash,
        embedding,
        dimensions: provider.dimensions,
        provider: provider.providerName,
        model: provider.modelName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "entity_type,entity_id" },
    );

    return embedding;
  } catch {
    // Embedding failed — non-blocking, return null
    return null;
  }
}
