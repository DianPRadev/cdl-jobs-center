import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface LeadMessage {
  id: string;
  companyId: string;
  leadId: string;
  direction: "outbound" | "inbound";
  channel: "email" | "sms";
  subject: string | null;
  body: string;
  fromAddr: string | null;
  toAddr: string | null;
  status: string;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMessage(row: Record<string, any>): LeadMessage {
  return {
    id:        row.id,
    companyId: row.company_id,
    leadId:    row.lead_id,
    direction: row.direction,
    channel:   row.channel,
    subject:   row.subject ?? null,
    body:      row.body,
    fromAddr:  row.from_addr ?? null,
    toAddr:    row.to_addr ?? null,
    status:    row.status,
    createdAt: row.created_at,
  };
}

/** Fetch all messages for a specific company ↔ lead thread */
export function useLeadMessages(leadId: string | null, companyId: string | undefined) {
  return useQuery({
    queryKey: ["lead-messages", leadId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_messages")
        .select("*")
        .eq("lead_id", leadId!)
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToMessage);
    },
    enabled: !!leadId && !!companyId,
    refetchInterval: 30_000,
  });
}

/** Send an email to a lead via the send-lead-email Edge Function */
export function useSendLeadEmail() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { leadId: string; subject: string; body: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let res: Response;
      try {
        res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              lead_id: params.leadId,
              subject: params.subject,
              body:    params.body,
            }),
            signal: controller.signal,
          },
        );
      } catch (e) {
        throw new Error(e instanceof Error && e.name === "AbortError" ? "Request timed out — check Supabase function logs" : String(e));
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["lead-messages", vars.leadId] });
    },
  });
}

/** Send an SMS to a lead via the send-lead-sms Edge Function */
export function useSendLeadSms() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { leadId: string; body: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-sms`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            lead_id: params.leadId,
            body:    params.body,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to send SMS" }));
        throw new Error((err as { error?: string }).error ?? "Failed to send SMS");
      }

      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["lead-messages", vars.leadId] });
    },
  });
}
