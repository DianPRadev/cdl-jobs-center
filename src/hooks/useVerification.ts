import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Convert a stored document value (path or legacy public URL) to a signed URL */
export async function getVerificationDocSignedUrl(storedValue: string): Promise<string | null> {
  // Extract path from legacy full public URLs
  let path = storedValue;
  const marker = "/object/public/verification-documents/";
  const idx = storedValue.indexOf(marker);
  if (idx !== -1) {
    path = storedValue.substring(idx + marker.length);
  }
  const { data } = await supabase.storage
    .from("verification-documents")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export interface VerificationRequest {
  id: string;
  companyId: string;
  status: "pending" | "approved" | "rejected";
  dotNumber: string;
  businessEin: string;
  yearsInBusiness: string;
  fleetSize: string;
  notes: string;
  documentUrls: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  // Joined company info (admin view)
  companyName?: string;
  companyEmail?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRequest(row: Record<string, any>): VerificationRequest {
  return {
    id: row.id,
    companyId: row.company_id,
    status: row.status,
    dotNumber: row.dot_number ?? "",
    businessEin: row.business_ein ?? "",
    yearsInBusiness: row.years_in_business ?? "",
    fleetSize: row.fleet_size ?? "",
    notes: row.notes ?? "",
    documentUrls: row.document_urls ?? [],
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    companyName: row.company_profiles?.company_name,
    companyEmail: row.company_profiles?.email,
  };
}

// ── Company hooks ──────────────────────────────────────────────────────────────

/** Fetch the latest verification request for a company */
export function useVerificationRequest(companyId: string | undefined) {
  return useQuery({
    queryKey: ["verification-request", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verification_requests")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return rowToRequest(data);
    },
    enabled: !!companyId,
  });
}

export interface SubmitVerificationPayload {
  companyId: string;
  dotNumber: string;
  businessEin: string;
  yearsInBusiness: string;
  fleetSize: string;
  notes: string;
  documentUrls: string[];
}

/** Submit a new verification request */
export function useSubmitVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SubmitVerificationPayload) => {
      const { error } = await supabase.from("verification_requests").insert({
        company_id: payload.companyId,
        dot_number: payload.dotNumber || null,
        business_ein: payload.businessEin || null,
        years_in_business: payload.yearsInBusiness || null,
        fleet_size: payload.fleetSize || null,
        notes: payload.notes || null,
        document_urls: payload.documentUrls,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["verification-request", vars.companyId] });
    },
  });
}

// ── Admin hooks ────────────────────────────────────────────────────────────────

/** Fetch all verification requests (admin) */
export function useAllVerificationRequests() {
  return useQuery({
    queryKey: ["admin-verification-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verification_requests")
        .select("*, company_profiles(company_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToRequest);
    },
  });
}

/** Approve or reject a verification request (admin) */
export function useReviewVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      companyId: string;
      decision: "approved" | "rejected";
      rejectionReason?: string;
      reviewedBy: string;
    }) => {
      // Update the request
      const { error: reqErr } = await supabase
        .from("verification_requests")
        .update({
          status: params.decision,
          reviewed_by: params.reviewedBy,
          reviewed_at: new Date().toISOString(),
          rejection_reason: params.decision === "rejected" ? (params.rejectionReason || null) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.requestId);
      if (reqErr) throw reqErr;

      // If approved, set is_verified on company_profiles
      if (params.decision === "approved") {
        const { error: compErr } = await supabase
          .from("company_profiles")
          .update({ is_verified: true })
          .eq("id", params.companyId);
        if (compErr) throw compErr;
      }
      // If rejected, ensure is_verified stays false
      if (params.decision === "rejected") {
        const { error: compErr } = await supabase
          .from("company_profiles")
          .update({ is_verified: false })
          .eq("id", params.companyId);
        if (compErr) throw compErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-verification-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["companies-directory-v2"] });
    },
  });
}
