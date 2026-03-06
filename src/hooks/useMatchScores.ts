import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ScoreBreakdown {
  [component: string]: { score: number; maxScore: number; detail: string };
}

export interface MatchReason {
  text: string;
  positive: boolean;
}

export type DriverConfidence = "high" | "medium" | "low";
export type DriverFeedback = "helpful" | "not_relevant" | "hide";
export type DriverMatchEventType = "view" | "click" | "save" | "apply";

export interface DriverMatchActions {
  canApply: boolean;
  canSave: boolean;
  feedback: DriverFeedback[];
}

export interface DriverJobMatch {
  jobId: string;
  overallScore: number;
  rulesScore: number;
  semanticScore: number | null;
  behaviorScore: number;
  confidence: DriverConfidence;
  topReasons: MatchReason[];
  cautions: MatchReason[];
  scoreBreakdown: ScoreBreakdown;
  missingFields: string[];
  actions: DriverMatchActions;
  degradedMode: boolean;
  computedAt: string;
  jobTitle: string;
  jobCompany: string;
  jobLocation: string;
  jobPay: string;
  jobType: string;
  jobRouteType: string;
  jobDriverType: string;
  jobTeamDriving: string;
  jobLogoUrl: string | null;
}

export type CompanyConfidence = "high" | "medium" | "low";
export type RankTier = "hot" | "warm" | "explore" | "blocked";
export type CompanyFeedback = "helpful" | "not_relevant" | "hide" | "contacted" | "interviewed" | "hired";
export type CompanyMatchEventType = "view" | "save" | "message" | "open_profile" | "contact";

export interface CompanyDriverMatch {
  candidateId: string;
  candidateSource: "application" | "lead";
  candidateDriverId: string | null;
  overallScore: number;
  rulesScore: number;
  semanticScore: number | null;
  behaviorScore: number;
  confidence: CompanyConfidence;
  rankTier: RankTier;
  topReasons: MatchReason[];
  cautions: MatchReason[];
  scoreBreakdown: ScoreBreakdown;
  missingFields: string[];
  hardBlocked: boolean;
  hardBlockReasons: string[];
  degradedMode: boolean;
  computedAt: string;
  candidateName: string;
  candidatePhone: string | null;
  candidateEmail: string | null;
  candidateState: string | null;
  candidateYearsExp: string | null;
  candidateDriverType: string | null;
  candidateLicenseClass: string | null;
}

export interface RolloutConfig {
  shadowMode: boolean;
  driverUiEnabled: boolean;
  companyUiEnabled: boolean;
  companyBetaIds: string[];
}

export interface DriverMatchQueryOpts {
  minScore?: number;
  excludeHidden?: boolean;
  limit?: number;
  offset?: number;
}

const DEFAULT_ACTIONS: DriverMatchActions = {
  canApply: true,
  canSave: true,
  feedback: ["helpful", "not_relevant", "hide"],
};

const asDriverConfidence = (value: unknown): DriverConfidence => {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
};

const parseActions = (raw: unknown): DriverMatchActions => {
  if (!raw || typeof raw !== "object") return DEFAULT_ACTIONS;
  const record = raw as Record<string, unknown>;
  const feedback = Array.isArray(record.feedback)
    ? record.feedback.filter(
        (item): item is DriverFeedback =>
          item === "helpful" || item === "not_relevant" || item === "hide",
      )
    : DEFAULT_ACTIONS.feedback;

  return {
    canApply: record.canApply !== false,
    canSave: record.canSave !== false,
    feedback: feedback.length > 0 ? feedback : DEFAULT_ACTIONS.feedback,
  };
};

const normalizeDriverMatchOpts = (
  optsOrLimit?: number | DriverMatchQueryOpts,
): DriverMatchQueryOpts => {
  if (typeof optsOrLimit === "number") {
    return { limit: optsOrLimit, excludeHidden: false };
  }
  return {
    minScore: optsOrLimit?.minScore,
    excludeHidden: optsOrLimit?.excludeHidden ?? false,
    limit: optsOrLimit?.limit ?? 5,
    offset: optsOrLimit?.offset,
  };
};

const invokeAuthedFunction = async <TData = unknown>(
  fnName: string,
  body: unknown,
): Promise<TData> => {
  const callOnce = async (accessToken?: string) =>
    supabase.functions.invoke(fnName, {
      body: body as Record<string, unknown>,
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
    });

  const {
    data: { session: initialSession },
  } = await supabase.auth.getSession();

  let { data, error } = await callOnce(initialSession?.access_token);

  // Retry once with a freshly rotated session token if the first call failed.
  if (error) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session?.access_token) {
      const retry = await callOnce(refreshed.session.access_token);
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    // If auth is no longer valid, clear local session and force a clean sign-in path.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      await supabase.auth.signOut({ scope: "local" });
      throw new Error("Your session expired. Please sign in again.");
    }
    throw new Error(error.message || `Failed to invoke ${fnName}`);
  }
  if ((data as { error?: unknown })?.error) {
    throw new Error(String((data as { error?: unknown }).error));
  }

  return data as TData;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDriverJobMatch(row: Record<string, any>): DriverJobMatch {
  const job = row.jobs ?? {};
  return {
    jobId: row.job_id,
    overallScore: row.overall_score,
    rulesScore: row.rules_score,
    semanticScore: row.semantic_score ?? null,
    behaviorScore: row.behavior_score ?? 0,
    confidence: asDriverConfidence(row.confidence),
    topReasons: (row.top_reasons ?? []) as MatchReason[],
    cautions: (row.cautions ?? []) as MatchReason[],
    scoreBreakdown: (row.score_breakdown ?? {}) as ScoreBreakdown,
    missingFields: Array.isArray(row.missing_fields)
      ? (row.missing_fields as string[])
      : [],
    actions: parseActions(row.actions),
    degradedMode: row.degraded_mode ?? false,
    computedAt: row.computed_at,
    jobTitle: job.title ?? "",
    jobCompany: job.company_name ?? "",
    jobLocation: job.location ?? "",
    jobPay: job.pay ?? "",
    jobType: job.type ?? "",
    jobRouteType: job.route_type ?? "",
    jobDriverType: job.driver_type ?? "",
    jobTeamDriving: job.team_driving ?? "",
    jobLogoUrl: job.company_profiles?.logo_url ?? null,
  };
}

function rowToCompanyDriverMatch(
  row: Record<string, unknown>,
  candidateData?: Record<string, unknown>,
): CompanyDriverMatch {
  let name = "";
  let phone: string | null = null;
  let email: string | null = null;
  let state: string | null = null;
  let yearsExp: string | null = null;
  let driverType: string | null = null;
  let licenseClass: string | null = null;

  if (candidateData) {
    if (row.candidate_source === "application") {
      name = `${candidateData.first_name ?? ""} ${candidateData.last_name ?? ""}`.trim();
      phone = (candidateData.phone as string) ?? null;
      email = (candidateData.email as string) ?? null;
      state = (candidateData.license_state as string) ?? null;
      yearsExp = (candidateData.years_exp as string) ?? null;
      driverType = (candidateData.driver_type as string) ?? null;
      licenseClass = (candidateData.license_class as string) ?? null;
    } else if (row.candidate_source === "lead") {
      name = (candidateData.full_name as string) ?? "";
      phone = (candidateData.phone as string) ?? null;
      email = (candidateData.email as string) ?? null;
      state = (candidateData.state as string) ?? null;
      yearsExp = (candidateData.years_exp as string) ?? null;
      driverType = candidateData.is_owner_op ? "owner-operator" : null;
    }
  }

  const asCompanyConfidence = (v: unknown): CompanyConfidence => {
    if (v === "high" || v === "medium" || v === "low") return v;
    return "medium";
  };
  const asRankTier = (v: unknown): RankTier => {
    if (v === "hot" || v === "warm" || v === "explore" || v === "blocked") return v;
    return "explore";
  };

  return {
    candidateId: row.candidate_id as string,
    candidateSource: row.candidate_source as CompanyDriverMatch["candidateSource"],
    candidateDriverId: (row.candidate_driver_id as string | null) ?? null,
    overallScore: row.overall_score as number,
    rulesScore: row.rules_score as number,
    semanticScore: (row.semantic_score as number | null) ?? null,
    behaviorScore: (row.behavior_score as number) ?? 0,
    confidence: asCompanyConfidence(row.confidence),
    rankTier: asRankTier(row.rank_tier),
    topReasons: (row.top_reasons ?? []) as MatchReason[],
    cautions: (row.cautions ?? []) as MatchReason[],
    scoreBreakdown: (row.score_breakdown ?? {}) as ScoreBreakdown,
    missingFields: Array.isArray(row.missing_fields) ? (row.missing_fields as string[]) : [],
    hardBlocked: (row.hard_blocked as boolean) ?? false,
    hardBlockReasons: Array.isArray(row.hard_block_reasons) ? (row.hard_block_reasons as string[]) : [],
    degradedMode: (row.degraded_mode as boolean) ?? false,
    computedAt: row.computed_at as string,
    candidateName: name,
    candidatePhone: phone,
    candidateEmail: email,
    candidateState: state,
    candidateYearsExp: yearsExp,
    candidateDriverType: driverType,
    candidateLicenseClass: licenseClass,
  };
}

export function useMatchingRollout() {
  return useQuery({
    queryKey: ["matching-rollout"],
    queryFn: async (): Promise<RolloutConfig> => {
      const { data, error } = await supabase
        .from("matching_rollout_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (error || !data) {
        return {
          shadowMode: true,
          driverUiEnabled: false,
          companyUiEnabled: false,
          companyBetaIds: [],
        };
      }

      return {
        shadowMode: data.shadow_mode ?? true,
        driverUiEnabled: data.driver_ui_enabled ?? false,
        companyUiEnabled: data.company_ui_enabled ?? false,
        companyBetaIds: (data.company_beta_ids ?? []) as string[],
      };
    },
    staleTime: 60_000,
  });
}

export function useDriverJobMatches(
  driverId: string | undefined,
  optsOrLimit?: number | DriverMatchQueryOpts,
) {
  const opts = normalizeDriverMatchOpts(optsOrLimit);

  return useQuery({
    queryKey: [
      "driver-matches",
      driverId,
      opts.minScore ?? null,
      opts.excludeHidden ?? false,
      opts.limit ?? null,
      opts.offset ?? null,
    ],
    queryFn: async () => {
      let query = supabase
        .from("driver_job_match_scores")
        .select(
          "*, jobs(title, company_name, company_id, location, pay, type, route_type, driver_type, team_driving, status)",
        )
        .eq("driver_id", driverId!)
        .order("overall_score", { ascending: false })
        .order("computed_at", { ascending: false });

      if (typeof opts.minScore === "number") {
        query = query.gte("overall_score", opts.minScore);
      }

      if (typeof opts.offset === "number" && typeof opts.limit === "number") {
        query = query.range(opts.offset, opts.offset + opts.limit - 1);
      } else if (typeof opts.limit === "number") {
        query = query.limit(opts.limit);
      }

      const { data, error } = await query;
      if (error) throw error;

      const activeRows = ((data ?? []) as Record<string, unknown>[])
        .filter((row) => {
          const job = row.jobs as Record<string, unknown> | null;
          return job && job.status === "Active";
        });

      // Batch-fetch company logos separately (no direct FK from jobs to company_profiles)
      const companyIds = [
        ...new Set(
          activeRows
            .map((row) => (row.jobs as Record<string, unknown> | null)?.company_id as string | undefined)
            .filter(Boolean),
        ),
      ] as string[];

      const logoMap = new Map<string, string | null>();
      if (companyIds.length > 0) {
        const { data: logos } = await supabase
          .from("company_profiles")
          .select("id, logo_url")
          .in("id", companyIds);
        for (const row of logos ?? []) {
          logoMap.set(row.id, row.logo_url ?? null);
        }
      }

      let rows = activeRows.map((row) => {
        const job = row.jobs as Record<string, unknown> | null;
        const companyId = job?.company_id as string | undefined;
        const logoUrl = companyId ? logoMap.get(companyId) ?? null : null;
        // Inject logo into job data for rowToDriverJobMatch
        if (job) {
          (job as Record<string, unknown>).company_profiles = { logo_url: logoUrl };
        }
        return rowToDriverJobMatch(row as Record<string, unknown>);
      });

      if (opts.excludeHidden && rows.length > 0) {
        const { data: hiddenRows } = await supabase
          .from("driver_match_feedback")
          .select("job_id")
          .eq("driver_id", driverId!)
          .eq("feedback", "hide");

        const hiddenJobIds = new Set(
          (hiddenRows ?? []).map((row) => row.job_id as string),
        );
        rows = rows.filter((row) => !hiddenJobIds.has(row.jobId));
      }

      return rows;
    },
    enabled: !!driverId,
  });
}

export function useDriverAllJobMatches(driverId: string | undefined) {
  return useQuery({
    queryKey: ["driver-all-matches", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_job_match_scores")
        .select("job_id, overall_score")
        .eq("driver_id", driverId!);

      if (error) throw error;

      const map = new Map<string, number>();
      for (const row of data ?? []) {
        map.set(row.job_id, row.overall_score);
      }
      return map;
    },
    enabled: !!driverId,
  });
}

export function useDriverJobMatchScore(
  driverId: string | undefined,
  jobId: string | undefined,
) {
  return useQuery({
    queryKey: ["driver-match-score", driverId, jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_job_match_scores")
        .select("*")
        .eq("driver_id", driverId!)
        .eq("job_id", jobId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        overallScore: data.overall_score as number,
        rulesScore: data.rules_score as number,
        semanticScore: data.semantic_score as number | null,
        behaviorScore: (data.behavior_score ?? 0) as number,
        confidence: asDriverConfidence(data.confidence),
        topReasons: (data.top_reasons ?? []) as MatchReason[],
        cautions: (data.cautions ?? []) as MatchReason[],
        scoreBreakdown: (data.score_breakdown ?? {}) as ScoreBreakdown,
        missingFields: (data.missing_fields ?? []) as string[],
        actions: parseActions(data.actions),
        degradedMode: data.degraded_mode as boolean,
        computedAt: data.computed_at as string,
      };
    },
    enabled: !!driverId && !!jobId,
  });
}

export function useCompanyDriverMatches(
  companyId: string | undefined,
  opts: {
    jobId?: string;
    source?: "application" | "lead";
    limit?: number;
  } = {},
) {
  return useQuery({
    queryKey: ["company-matches", companyId, opts.jobId, opts.source, opts.limit],
    queryFn: async () => {
      // Fetch scores — job-linked rows require active job, jobless rows (profile-based) are always included
      let scores: Record<string, unknown>[] = [];

      if (opts.jobId) {
        // Specific job filter — only job-linked rows
        const { data, error } = await supabase
          .from("company_driver_match_scores")
          .select("*, jobs!inner(status)")
          .eq("company_id", companyId!)
          .eq("job_id", opts.jobId)
          .eq("jobs.status", "Active")
          .order("overall_score", { ascending: false })
          .limit(opts.limit ?? 10000);
        if (error) throw error;
        scores = (data ?? []) as Record<string, unknown>[];
      } else {
        // All matches: fetch job-linked (active only) + jobless (profile-based) in parallel
        const [jobLinked, jobless] = await Promise.all([
          supabase
            .from("company_driver_match_scores")
            .select("*, jobs!inner(status)")
            .eq("company_id", companyId!)
            .eq("jobs.status", "Active")
            .not("job_id", "is", null)
            .order("overall_score", { ascending: false }),
          supabase
            .from("company_driver_match_scores")
            .select("*")
            .eq("company_id", companyId!)
            .is("job_id", null)
            .order("overall_score", { ascending: false }),
        ]);
        if (jobLinked.error) throw jobLinked.error;
        if (jobless.error) throw jobless.error;
        scores = [
          ...((jobLinked.data ?? []) as Record<string, unknown>[]),
          ...((jobless.data ?? []) as Record<string, unknown>[]),
        ];
      }

      if (opts.source) {
        scores = scores.filter((s) => s.candidate_source === opts.source);
      }
      if (!scores || scores.length === 0) return [];

      const appIds = [
        ...new Set(
          scores
            .filter((s) => s.candidate_source === "application")
            .map((s) => s.candidate_id),
        ),
      ];
      const leadIds = [
        ...new Set(
          scores
            .filter((s) => s.candidate_source === "lead")
            .map((s) => s.candidate_id),
        ),
      ];

      const candidateMap = new Map<string, Record<string, unknown>>();

      const [appsResult, leadsResult] = await Promise.all([
        appIds.length > 0
          ? supabase
              .from("applications")
              .select(
                "id, first_name, last_name, phone, email, license_state, years_exp, driver_type, license_class",
              )
              .in("id", appIds)
          : Promise.resolve({ data: [] }),
        leadIds.length > 0
          ? supabase
              .from("leads")
              .select("id, full_name, phone, email, state, years_exp, is_owner_op")
              .in("id", leadIds)
          : Promise.resolve({ data: [] }),
      ]);

      const appsError = (appsResult as { error?: { message?: string } | null }).error;
      if (appsError) throw new Error(appsError.message || "Failed to load application candidates");
      const leadsError = (leadsResult as { error?: { message?: string } | null }).error;
      if (leadsError) throw new Error(leadsError.message || "Failed to load lead candidates");

      for (const row of appsResult.data ?? []) {
        candidateMap.set(row.id, row as Record<string, unknown>);
      }
      for (const row of leadsResult.data ?? []) {
        candidateMap.set(row.id, row as Record<string, unknown>);
      }

      const allMatches = (scores as Record<string, unknown>[]).map((row) =>
        rowToCompanyDriverMatch(
          row,
          candidateMap.get(row.candidate_id as string) as
            | Record<string, unknown>
            | undefined,
        ),
      );

      // When showing "All Jobs", the same candidate can appear once per job.
      // Deduplicate by actual person identity, keeping the highest score.
      // For applications: candidateDriverId is the real driver user ID (candidateId is just the application row ID).
      // For leads: candidateDriverId is null, so fall back to candidateId (lead ID, unique per person).
      if (!opts.jobId) {
        const seen = new Map<string, typeof allMatches[number]>();
        for (const m of allMatches) {
          const personKey = `${m.candidateDriverId ?? m.candidateId}:${m.candidateSource}`;
          const existing = seen.get(personKey);
          if (!existing || m.overallScore > existing.overallScore) {
            seen.set(personKey, m);
          }
        }
        const deduped = Array.from(seen.values()).sort((a, b) => b.overallScore - a.overallScore);
        // Apply the subscription limit AFTER dedup so it counts unique people, not duplicate rows
        if (opts.limit) return deduped.slice(0, opts.limit);
        return deduped;
      }

      return allMatches;
    },
    enabled: !!companyId,
  });
}

/**
 * Fetch the best match score per lead for a company (used for teaser on locked leads).
 * Returns a Map<leadId, { score, tier, topReason }>.
 */
export function useLeadMatchScores(companyId: string | undefined) {
  return useQuery({
    queryKey: ["lead-match-scores", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_driver_match_scores")
        .select("candidate_id, overall_score, rank_tier, top_reasons")
        .eq("company_id", companyId!)
        .eq("candidate_source", "lead")
        .order("overall_score", { ascending: false });
      if (error) throw error;

      // Keep only the best score per lead
      const map = new Map<string, { score: number; tier: RankTier; topReason: string | null }>();
      for (const row of data ?? []) {
        if (!map.has(row.candidate_id)) {
          const reasons = Array.isArray(row.top_reasons) ? row.top_reasons : [];
          map.set(row.candidate_id, {
            score: row.overall_score ?? 0,
            tier: asRankTier(row.rank_tier),
            topReason: reasons.length > 0 ? (reasons[0] as { text?: string }).text ?? null : null,
          });
        }
      }
      return map;
    },
    enabled: !!companyId,
  });
}

export function useDriverFeedbackMap(driverId: string | undefined) {
  return useQuery({
    queryKey: ["driver-feedback-map", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_match_feedback")
        .select("job_id, feedback")
        .eq("driver_id", driverId!);
      if (error) throw error;
      const map = new Map<string, DriverFeedback>();
      for (const row of data ?? []) {
        map.set(row.job_id, row.feedback as DriverFeedback);
      }
      return map;
    },
    enabled: !!driverId,
  });
}

export function useRecordDriverMatchFeedback(driverId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { jobId: string; feedback: DriverFeedback }) => {
      await invokeAuthedFunction("record-match-feedback", params);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver-matches", driverId] });
      qc.invalidateQueries({ queryKey: ["driver-all-matches", driverId] });
      qc.invalidateQueries({ queryKey: ["driver-match-score", driverId] });
      qc.invalidateQueries({ queryKey: ["driver-feedback-map", driverId] });
    },
  });
}

export function useTrackDriverMatchEvent(driverId: string | undefined) {
  return useMutation({
    mutationFn: async (params: {
      jobId: string;
      eventType: DriverMatchEventType;
      metadata?: Record<string, unknown>;
    }) => {
      if (!driverId) return;
      const { error } = await supabase.from("driver_match_events").insert({
        driver_id: driverId,
        job_id: params.jobId,
        event_type: params.eventType,
        metadata: params.metadata ?? {},
      });
      if (error) throw error;
    },
  });
}

export function useRefreshMyMatches(driverId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await invokeAuthedFunction("refresh-my-matches", {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver-matches", driverId] });
      qc.invalidateQueries({ queryKey: ["driver-all-matches", driverId] });
      qc.invalidateQueries({ queryKey: ["driver-match-score", driverId] });
    },
  });
}

// ── Company feedback & events ──────────────────────────────

export function useCompanyFeedbackMap(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-feedback-map", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_match_feedback")
        .select("candidate_source, candidate_id, feedback")
        .eq("company_id", companyId!);
      if (error) throw error;
      const map = new Map<string, CompanyFeedback>();
      for (const row of data ?? []) {
        map.set(`${row.candidate_source}:${row.candidate_id}`, row.feedback as CompanyFeedback);
      }
      return map;
    },
    enabled: !!companyId,
  });
}

export function useRecordCompanyMatchFeedback(companyId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      jobId: string;
      candidateSource: "application" | "lead";
      candidateId: string;
      feedback: CompanyFeedback;
      reasonCode?: string;
    }) => {
      if (!companyId) throw new Error("No company ID");
      const { error } = await supabase
        .from("company_match_feedback")
        .upsert(
          {
            company_id: companyId,
            job_id: params.jobId,
            candidate_source: params.candidateSource,
            candidate_id: params.candidateId,
            feedback: params.feedback,
            reason_code: params.reasonCode ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,job_id,candidate_source,candidate_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-matches", companyId] });
      qc.invalidateQueries({ queryKey: ["company-feedback-map", companyId] });
    },
  });
}

export function useTrackCompanyMatchEvent(companyId: string | undefined) {
  return useMutation({
    mutationFn: async (params: {
      jobId: string;
      candidateSource: "application" | "lead";
      candidateId: string;
      eventType: CompanyMatchEventType;
      metadata?: Record<string, unknown>;
    }) => {
      if (!companyId) return;
      const { error } = await supabase.from("company_match_events").insert({
        company_id: companyId,
        job_id: params.jobId,
        candidate_source: params.candidateSource,
        candidate_id: params.candidateId,
        event_type: params.eventType,
        metadata: params.metadata ?? {},
      });
      if (error) throw error;
    },
  });
}
