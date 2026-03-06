/**
 * match-backfill-nightly — Full refresh of all match scores.
 * Recomputes driver×job and company×candidate match tables.
 * Designed to run nightly at 2am UTC via pg_cron.
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

const TIMEOUT_MS = 50_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Auth: only allow service-role key
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader?.replace("Bearer ", "") ?? "";

    if (token !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const embeddingProvider = createEmbeddingProvider();

    // ── Phase A: driver × job scores ─────────────────────────

    // Fetch all active jobs
    const { data: jobs } = await supabase
      .from("jobs")
      .select("*")
      .eq("status", "Active");

    // Fetch driver profiles (updated in last 90 days for recency)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { data: drivers } = await supabase
      .from("driver_profiles")
      .select("*")
      .gte("updated_at", ninetyDaysAgo);

    let driverJobPairs = 0;
    let companyDriverPairs = 0;
    let timedOut = false;

    if (jobs && drivers) {
      for (const profile of drivers) {
        if (Date.now() - startTime > TIMEOUT_MS) {
          timedOut = true;
          break;
        }

        // Fetch latest application for enrichment
        const { data: latestApp } = await supabase
          .from("applications")
          .select("*")
          .eq("driver_id", profile.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const driverFeatures = extractDriverFeatures(profile, latestApp);

        const driverEmb = embeddingProvider
          ? await getOrComputeEmbedding(supabase, embeddingProvider, "driver", profile.id, driverFeatures.textBlock)
          : null;

        const batch = [];
        for (const jobRow of jobs) {
          const jobFeatures = extractJobFeatures(jobRow);
          const result = computeDriverJobRulesScore(driverFeatures, jobFeatures);

          if (driverEmb) {
            const jobEmb = await getOrComputeEmbedding(supabase, embeddingProvider!, "job", jobRow.id, jobFeatures.textBlock);
            if (jobEmb) {
              const sim = cosineSimilarity(driverEmb, jobEmb);
              result.semanticScore = Math.round(Math.max(0, sim) * 10);
              result.overallScore = result.rulesScore + result.semanticScore;
            }
          }

          batch.push({
            driver_id: profile.id,
            job_id: jobRow.id,
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
          });
        }

        if (batch.length > 0) {
          await supabase
            .from("driver_job_match_scores")
            .upsert(batch, { onConflict: "driver_id,job_id" });
          driverJobPairs += batch.length;
        }
      }
    }

    // ── Phase B: company × candidate scores ──────────────────

    if (!timedOut && jobs) {
      // Group jobs by company
      const jobsByCompany = new Map<string, typeof jobs>();
      for (const j of jobs) {
        const cid = j.company_id;
        if (!jobsByCompany.has(cid)) jobsByCompany.set(cid, []);
        jobsByCompany.get(cid)!.push(j);
      }

      for (const [companyId, companyJobs] of jobsByCompany) {
        if (Date.now() - startTime > TIMEOUT_MS) {
          timedOut = true;
          break;
        }

        // Fetch company's applications
        const { data: apps } = await supabase
          .from("applications")
          .select("*")
          .eq("company_id", companyId);

        // Fetch company's leads
        const { data: leads } = await supabase
          .from("leads")
          .select("*")
          .eq("company_id", companyId);

        for (const jobRow of companyJobs) {
          if (Date.now() - startTime > TIMEOUT_MS) {
            timedOut = true;
            break;
          }

          const jobFeatures = extractJobFeatures(jobRow);
          const jobEmb = embeddingProvider
            ? await getOrComputeEmbedding(supabase, embeddingProvider, "job", jobRow.id, jobFeatures.textBlock)
            : null;

          // Score applications
          if (apps) {
            const appRows = [];
            for (const app of apps) {
              const candidate = extractCandidateFromApplication(app);
              const result = computeCompanyDriverRulesScore(candidate, jobFeatures);

              if (jobEmb && embeddingProvider) {
                const candEmb = await getOrComputeEmbedding(supabase, embeddingProvider, "application", app.id, candidate.textBlock);
                if (candEmb) {
                  const sim = cosineSimilarity(candEmb, jobEmb);
                  result.semanticScore = Math.round(Math.max(0, sim) * 10);
                  result.overallScore = result.rulesScore + result.semanticScore;
                }
              }

              appRows.push({
                company_id: companyId,
                job_id: jobRow.id,
                candidate_source: "application" as const,
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
              });
            }
            if (appRows.length > 0) {
              await supabase
                .from("company_driver_match_scores")
                .upsert(appRows, { onConflict: "company_id,job_id,candidate_source,candidate_id" });
              companyDriverPairs += appRows.length;
            }
          }

          // Score leads
          if (leads) {
            const leadRows = [];
            for (const lead of leads) {
              const candidate = extractCandidateFromLead(lead);
              const result = computeCompanyDriverRulesScore(candidate, jobFeatures);

              if (jobEmb && embeddingProvider) {
                const candEmb = await getOrComputeEmbedding(supabase, embeddingProvider, "lead", lead.id, candidate.textBlock);
                if (candEmb) {
                  const sim = cosineSimilarity(candEmb, jobEmb);
                  result.semanticScore = Math.round(Math.max(0, sim) * 10);
                  result.overallScore = result.rulesScore + result.semanticScore;
                }
              }

              leadRows.push({
                company_id: companyId,
                job_id: jobRow.id,
                candidate_source: "lead" as const,
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
              });
            }
            if (leadRows.length > 0) {
              await supabase
                .from("company_driver_match_scores")
                .upsert(leadRows, { onConflict: "company_id,job_id,candidate_source,candidate_id" });
              companyDriverPairs += leadRows.length;
            }
          }
        }
      }
    }

    // ── Phase C: jobless companies — score leads against company profile ──

    if (!timedOut) {
      // Find companies that have leads but NO active jobs (not already scored above)
      const companiesWithJobs = jobs ? new Set(jobs.map((j: Record<string, any>) => j.company_id as string)) : new Set<string>();

      // Get distinct company_ids from leads that were NOT scored in Phase B
      const { data: leadCompanies } = await supabase
        .from("leads")
        .select("company_id")
        .not("company_id", "is", null);

      if (leadCompanies) {
        const joblessCompanyIds = [
          ...new Set(
            leadCompanies
              .map((r: Record<string, any>) => r.company_id as string)
              .filter((cid: string) => !companiesWithJobs.has(cid)),
          ),
        ];

        for (const companyId of joblessCompanyIds) {
          if (Date.now() - startTime > TIMEOUT_MS) {
            timedOut = true;
            break;
          }

          // Build synthetic job from company profile
          const { data: cp } = await supabase
            .from("company_profiles")
            .select("company_name, address, about, company_goal")
            .eq("id", companyId)
            .maybeSingle();

          const companyName = cp?.company_name ?? "Company";
          const address = cp?.address ?? null;
          const about = cp?.about ?? "";
          const goal = cp?.company_goal ?? "";

          const profileJob: JobFeatures = {
            jobId: `profile-${companyId}`,
            companyId,
            title: `${companyName} — General Hiring`,
            description: [about, goal].filter(Boolean).join(" "),
            driverType: null,
            routeType: null,
            freightType: null,
            teamDriving: null,
            location: address,
            pay: null,
            status: "Active",
            textBlock: `${companyName} hiring CDL drivers. ${about} ${goal}`.trim(),
          };

          // Fetch company's leads
          const { data: leads } = await supabase
            .from("leads")
            .select("*")
            .eq("company_id", companyId);

          if (leads && leads.length > 0) {
            const leadRows = [];
            for (const lead of leads) {
              const candidate = extractCandidateFromLead(lead);
              const result = computeCompanyDriverRulesScore(candidate, profileJob);

              leadRows.push({
                company_id: companyId,
                job_id: null,
                candidate_source: "lead" as const,
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
              });
            }
            if (leadRows.length > 0) {
              // For null job_id rows, delete existing first then insert (can't upsert on nullable column easily)
              await supabase
                .from("company_driver_match_scores")
                .delete()
                .eq("company_id", companyId)
                .eq("candidate_source", "lead")
                .is("job_id", null);
              await supabase
                .from("company_driver_match_scores")
                .insert(leadRows);
              companyDriverPairs += leadRows.length;
            }
          }
        }
      }
    }

    const elapsed = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        driverJobPairs,
        companyDriverPairs,
        elapsed: `${elapsed}ms`,
        complete: !timedOut,
      }),
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

// ── Feature extractors (same as match-recompute) ───────────

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
    licenseClass: null,
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

type SupabaseClient = ReturnType<typeof createClient>;

async function getOrComputeEmbedding(
  supabase: SupabaseClient,
  provider: EmbeddingProvider,
  entityType: string,
  entityId: string,
  text: string,
): Promise<number[] | null> {
  if (!text.trim()) return null;

  const hash = contentHash(text);

  const { data: cached } = await supabase
    .from("matching_text_embeddings")
    .select("embedding, content_hash")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (cached && cached.content_hash === hash) {
    return cached.embedding as number[];
  }

  try {
    const [embedding] = await provider.embed([text]);
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
    return null;
  }
}
