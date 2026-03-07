import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type PipelineStage = "New" | "Reviewing" | "Interview" | "Hired" | "Rejected";

export interface PipelineLead {
  id: string;
  companyId: string;
  leadId: string;
  stage: PipelineStage;
  createdAt: string;
  // Joined lead fields
  fullName: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  yearsExp: string | null;
  isOwnerOp: boolean;
}

export function usePipelineLeads(companyId?: string) {
  return useQuery({
    queryKey: ["pipeline-leads", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_leads")
        .select("*, leads(full_name, phone, email, state, years_exp, is_owner_op)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any): PipelineLead => ({
        id: row.id,
        companyId: row.company_id,
        leadId: row.lead_id,
        stage: row.stage as PipelineStage,
        createdAt: row.created_at,
        fullName: row.leads?.full_name ?? "Unknown",
        phone: row.leads?.phone ?? null,
        email: row.leads?.email ?? null,
        state: row.leads?.state ?? null,
        yearsExp: row.leads?.years_exp ?? null,
        isOwnerOp: row.leads?.is_owner_op ?? false,
      }));
    },
  });
}

export function useAddToPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { companyId: string; leadId: string }) => {
      const { error } = await supabase
        .from("pipeline_leads")
        .upsert(
          { company_id: params.companyId, lead_id: params.leadId, stage: "New" },
          { onConflict: "company_id,lead_id" },
        );
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-leads"] });
    },
  });
}

export function useUpdatePipelineStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; stage: PipelineStage }) => {
      const { error } = await supabase
        .from("pipeline_leads")
        .update({ stage: params.stage, updated_at: new Date().toISOString() })
        .eq("id", params.id);
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["pipeline-leads"] });
      const queries = qc.getQueriesData<PipelineLead[]>({ queryKey: ["pipeline-leads"] });
      const prevMap = new Map<string, PipelineLead[]>();
      for (const [key, data] of queries) {
        if (!data) continue;
        prevMap.set(JSON.stringify(key), data);
        qc.setQueryData<PipelineLead[]>(key,
          data.map((pl) => (pl.id === vars.id ? { ...pl, stage: vars.stage } : pl)),
        );
      }
      return { prevMap };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevMap) {
        for (const [keyStr, data] of ctx.prevMap) {
          qc.setQueryData(JSON.parse(keyStr), data);
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-leads"] });
    },
  });
}

export function useRemoveFromPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string }) => {
      const { error } = await supabase
        .from("pipeline_leads")
        .delete()
        .eq("id", params.id);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-leads"] });
    },
  });
}
