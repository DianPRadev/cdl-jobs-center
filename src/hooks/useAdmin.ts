import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { PLANS, type Plan } from "@/hooks/useSubscription";

/* ── Interfaces ─────────────────────────────────────────────────────── */

export interface AdminUser {
  id: string;
  name: string;
  role: "driver" | "company" | "admin";
  email: string | null;
  phone: string | null;
  state: string | null;
  yearsExp: string | null;
  companyName: string | null;
  isVerified: boolean;
  createdAt: string;
}

export interface AdminSubscription {
  id: string;
  companyId: string;
  companyName: string;
  plan: Plan;
  leadLimit: number;
  leadsUsed: number;
  status: string;
  currentPeriodEnd: string | null;
  createdAt: string;
}

export interface AdminJob {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  location: string;
  pay: string;
  type: string;
  status: "Draft" | "Active" | "Paused" | "Closed";
  postedAt: string | null;
}

export interface AdminLead {
  id: string;
  source: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  yearsExp: string | null;
  isOwnerOp: boolean;
  status: "new" | "contacted" | "hired" | "dismissed";
  createdAt: string;
}

/* ── Row mappers ────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAdminUser(row: Record<string, any>, extra?: { email?: string | null; phone?: string | null; state?: string | null; yearsExp?: string | null; companyName?: string | null; isVerified?: boolean }): AdminUser {
  return {
    id: row.id,
    name: row.name ?? "",
    role: row.role ?? "driver",
    email: extra?.email ?? null,
    phone: extra?.phone ?? null,
    state: extra?.state ?? null,
    yearsExp: extra?.yearsExp ?? null,
    companyName: extra?.companyName ?? null,
    isVerified: extra?.isVerified ?? false,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAdminJob(row: Record<string, any>): AdminJob {
  return {
    id: row.id,
    companyId: row.company_id ?? "",
    companyName: row.company_name ?? "Unknown",
    title: row.title ?? "",
    location: row.location ?? "",
    pay: row.pay ?? "",
    type: row.type ?? "",
    status: row.status ?? "Active",
    postedAt: row.posted_at ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAdminLead(row: Record<string, any>): AdminLead {
  return {
    id: row.id,
    source: row.source ?? "facebook",
    fullName: row.full_name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    state: row.state ?? null,
    yearsExp: row.years_exp ?? null,
    isOwnerOp: row.is_owner_op ?? false,
    status: row.status ?? "new",
    createdAt: row.created_at,
  };
}

/* ── Queries ────────────────────────────────────────────────────────── */

/** Platform-wide aggregate counts */
export function useAdminStats() {
  return useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [usersRes, driversRes, companiesRes, jobsRes, appsRes, leadsRes] =
        await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver"),
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "company"),
          supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "Active"),
          supabase.from("applications").select("*", { count: "exact", head: true }),
          supabase.from("leads").select("*", { count: "exact", head: true }),
        ]);
      return {
        totalUsers: usersRes.count ?? 0,
        totalDrivers: driversRes.count ?? 0,
        totalCompanies: companiesRes.count ?? 0,
        activeJobs: jobsRes.count ?? 0,
        totalApplications: appsRes.count ?? 0,
        totalLeads: leadsRes.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });
}

/** All profiles enriched with driver_profiles / company_profiles */
export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [profilesRes, driverRes, companyRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, role, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("driver_profiles_safe")
          .select("id, years_exp, license_state"),
        supabase
          .from("company_profiles")
          .select("id, company_name, email, phone, is_verified"),
      ]);
      if (profilesRes.error) throw profilesRes.error;

      const driverMap = new Map(
        (driverRes.data ?? []).map((d) => [d.id, d])
      );
      const companyMap = new Map(
        (companyRes.data ?? []).map((c) => [c.id, c])
      );

      return (profilesRes.data ?? []).map((row) => {
        const dp = driverMap.get(row.id);
        const cp = companyMap.get(row.id);
        return rowToAdminUser(row, {
          email: cp?.email ?? null,
          phone: cp?.phone ?? null,
          state: dp?.license_state ?? null,
          yearsExp: dp?.years_exp ?? null,
          companyName: cp?.company_name ?? null,
          isVerified: cp?.is_verified ?? false,
        });
      });
    },
  });
}

/** All subscriptions joined with company names */
export function useAdminSubscriptions() {
  return useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      // Get all companies
      const { data: companies } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("role", "company");
      const nameMap = new Map((companies ?? []).map((c) => [c.id, c.name]));

      // Get existing subscriptions
      const { data: subs, error } = await supabase
        .from("subscriptions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const subMap = new Map(
        (subs ?? []).map((s) => [s.company_id, s])
      );

      // Build result: every company gets a row, defaulting to free if no subscription
      const result: AdminSubscription[] = [];
      for (const [companyId, companyName] of nameMap) {
        const row = subMap.get(companyId);
        if (row) {
          result.push({
            id: row.id,
            companyId: row.company_id,
            companyName: companyName ?? "Unknown",
            plan: row.plan ?? "free",
            leadLimit: row.lead_limit ?? 3,
            leadsUsed: row.leads_used ?? 0,
            status: row.status ?? "active",
            currentPeriodEnd: row.current_period_end ?? null,
            createdAt: row.created_at,
          });
        } else {
          result.push({
            id: `no-sub-${companyId}`,
            companyId,
            companyName: companyName ?? "Unknown",
            plan: "free",
            leadLimit: 3,
            leadsUsed: 0,
            status: "active",
            currentPeriodEnd: null,
            createdAt: "",
          });
        }
      }
      return result;
    },
  });
}

/** All jobs across all companies */
export function useAdminJobs() {
  return useQuery({
    queryKey: ["admin-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .order("posted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToAdminJob);
    },
  });
}

/** All leads */
export function useAdminLeads() {
  return useQuery({
    queryKey: ["admin-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []).map(rowToAdminLead);
    },
    refetchInterval: 60_000,
  });
}

/* ── Mutations ──────────────────────────────────────────────────────── */

/** Admin changes a job's status */
export function useAdminUpdateJobStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { jobId: string; status: "Active" | "Paused" | "Closed" }) => {
      const { error } = await supabase
        .from("jobs")
        .update({ status: params.status, updated_at: new Date().toISOString() })
        .eq("id", params.jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
}

/** Admin changes a company's subscription plan */
export function useChangeSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { companyId: string; plan: Plan }) => {
      const planInfo = PLANS[params.plan];
      const { error } = await supabase
        .from("subscriptions")
        .upsert(
          {
            company_id: params.companyId,
            plan: params.plan,
            lead_limit: planInfo.leads,
            status: "active",
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000
            ).toISOString(),
          },
          { onConflict: "company_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
  });
}

/** Admin toggles company verified status */
export function useToggleCompanyVerified() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { companyId: string; verified: boolean }) => {
      const { error } = await supabase
        .from("company_profiles")
        .update({ is_verified: params.verified })
        .eq("id", params.companyId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["companies-directory-v2"] });
      qc.invalidateQueries({ queryKey: ["company-profile", vars.companyId] });
      qc.invalidateQueries({ queryKey: ["company-logo", vars.companyId] });
      qc.invalidateQueries({ queryKey: ["verification-requests"] });
    },
  });
}
