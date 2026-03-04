import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Job } from "@/data/jobs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToJob(row: Record<string, any>): Job {
  const cp = row.company_profiles as Record<string, unknown> | null | undefined;
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    company: (row.company_name ?? "") as string,
    title: (row.title ?? "") as string,
    description: (row.description ?? "") as string,
    type: (row.type ?? "") as string,
    driverType: (row.driver_type ?? "") as string,
    routeType: (row.route_type ?? "") as string,
    teamDriving: (row.team_driving ?? "") as string,
    location: (row.location ?? "") as string,
    pay: (row.pay ?? "") as string,
    status: row.status as Job["status"],
    postedAt: row.posted_at as string | undefined,
    logoUrl: cp ? (cp.logo_url as string | undefined) : undefined,
  };
}

// ── Batch-fetch company logos (no direct FK from jobs to company_profiles) ────
async function attachLogos(rows: Record<string, unknown>[]): Promise<Job[]> {
  const companyIds = [...new Set(rows.map((r) => r.company_id as string).filter(Boolean))];
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
  return rows.map((row) =>
    rowToJob({ ...row, company_profiles: { logo_url: logoMap.get(row.company_id as string) ?? null } }),
  );
}

// ── Public listing — all Active jobs ─────────────────────────────────────────
export function useActiveJobs() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["active-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "Active")
        .order("posted_at", { ascending: false });
      if (error) throw error;
      return attachLogos((data ?? []) as Record<string, unknown>[]);
    },
    staleTime: 60_000,
    refetchOnMount: "always",
  });
  return { jobs: data ?? [], isLoading, error, refetch };
}

// ── Single job by ID ──────────────────────────────────────────────────────────
export function useJobById(jobId: string | undefined) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", jobId!)
        .single();
      if (error) throw error;
      if (!data) return null;
      // Fetch company logo
      const { data: cp } = await supabase
        .from("company_profiles")
        .select("logo_url")
        .eq("id", data.company_id)
        .maybeSingle();
      return rowToJob({ ...data, company_profiles: cp ?? null });
    },
    enabled: !!jobId,
    refetchOnMount: "always",
  });
  return { job: data ?? null, isLoading, isError };
}

// ── Company's own jobs — with CRUD mutations ──────────────────────────────────
export function useJobs(companyId: string) {
  const qc = useQueryClient();
  const key = ["jobs", companyId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("company_id", companyId)
        .order("posted_at", { ascending: false });
      if (error) throw error;
      return attachLogos((data ?? []) as Record<string, unknown>[]);
    },
    enabled: !!companyId,
    refetchOnMount: "always",
  });

  const addMutation = useMutation({
    mutationFn: async (job: Omit<Job, "id" | "postedAt" | "companyId" | "logoUrl"> & { companyName: string }) => {
      const payload = {
        company_id: companyId,
        company_name: job.companyName,
        title: job.title,
        description: job.description,
        type: job.type,
        driver_type: job.driverType,
        route_type: job.routeType,
        team_driving: job.teamDriving,
        location: job.location,
        pay: job.pay,
        status: job.status ?? "Active",
      };
      const { error } = await supabase.from("jobs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Job> }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined) updates.description = data.description;
      if (data.type !== undefined) updates.type = data.type;
      if (data.driverType !== undefined) updates.driver_type = data.driverType;
      if (data.routeType !== undefined) updates.route_type = data.routeType;
      if (data.teamDriving !== undefined) updates.team_driving = data.teamDriving;
      if (data.location !== undefined) updates.location = data.location;
      if (data.pay !== undefined) updates.pay = data.pay;
      if (data.status !== undefined) updates.status = data.status;
      const { error } = await supabase.from("jobs").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    jobs: data ?? [],
    isLoading,
    addJob: (job: Omit<Job, "id" | "postedAt" | "companyId" | "logoUrl"> & { companyName: string }) =>
      addMutation.mutateAsync(job),
    updateJob: (id: string, data: Partial<Job>) => updateMutation.mutateAsync({ id, data }),
    removeJob: (id: string) => removeMutation.mutateAsync(id),
  };
}
