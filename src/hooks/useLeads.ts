import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/withTimeout";

export interface Lead {
  id: string;
  source: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  yearsExp: string | null;
  isOwnerOp: boolean;
  truckYear: string | null;
  truckMake: string | null;
  truckModel: string | null;
  status: "new" | "contacted" | "hired" | "dismissed";
  syncedAt: string;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLead(row: Record<string, any>): Lead {
  return {
    id: row.id,
    source: row.source ?? "facebook",
    fullName: row.full_name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    state: row.state ?? null,
    yearsExp: row.years_exp ?? null,
    isOwnerOp: row.is_owner_op ?? false,
    truckYear: row.truck_year ?? null,
    truckMake: row.truck_make ?? null,
    truckModel: row.truck_model ?? null,
    status: row.status ?? "new",
    syncedAt: row.synced_at ?? row.created_at,
    createdAt: row.created_at,
  };
}

/** Fetch leads for a company */
export function useLeads(companyId?: string) {
  return useQuery({
    queryKey: ["leads", companyId ?? "all"],
    refetchOnMount: "always",
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) return [];
      return data.map(rowToLead);
    },
    refetchInterval: 60_000,
  });
}

export interface SyncResult {
  synced: number;
  new: number;
  updated: number;
  errors: string[];
}

/** Trigger Google Sheets → leads sync via Edge Function */
export function useSyncLeads() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const { data, error } = await withTimeout(supabase.functions.invoke("sync-leads", {
        body: {},
      }), 30_000);

      if (error) {
        // Extract actual error message from FunctionsHttpError if available
        let message = "Sync failed";
        try {
          if (error.context && typeof error.context.json === "function") {
            const body = await error.context.json();
            message = body?.error ?? error.message ?? message;
          } else {
            message = error.message ?? message;
          }
        } catch {
          message = error.message ?? message;
        }
        throw new Error(message);
      }

      if (!data || typeof data !== "object") {
        throw new Error("Sync returned an unexpected response");
      }

      return {
        synced: Number(data.synced ?? 0),
        new: Number(data.new ?? 0),
        updated: Number(data.updated ?? 0),
        errors: Array.isArray(data.errors) ? (data.errors as string[]) : [],
      };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/** Update a lead's status */
export function useUpdateLeadStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { leadId: string; status: Lead["status"] }) => {
      const { error } = await withTimeout(supabase
        .from("leads")
        .update({ status: params.status })
        .eq("id", params.leadId), 15_000);
      if (error) throw error;
    },
    // Optimistic update — use fuzzy key matching since the actual key includes companyId
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      // Find all cached lead queries and update them
      const queries = qc.getQueriesData<Lead[]>({ queryKey: ["leads"] });
      const prevMap = new Map<string, Lead[]>();
      for (const [key, data] of queries) {
        if (!data) continue;
        const keyStr = JSON.stringify(key);
        prevMap.set(keyStr, data);
        qc.setQueryData<Lead[]>(key,
          data.map((l) => (l.id === vars.leadId ? { ...l, status: vars.status } : l))
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
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
