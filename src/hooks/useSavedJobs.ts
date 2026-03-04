import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/withTimeout";

type ToggleSavedJobVars = {
  jobId: string;
  shouldSave: boolean;
};

export function useSavedJobs(driverId: string) {
  const qc = useQueryClient();
  const key = ["saved_jobs", driverId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_jobs")
        .select("job_id")
        .eq("driver_id", driverId);
      if (error) throw error;
      return (data ?? []).map((r) => r.job_id as string);
    },
    enabled: !!driverId,
  });

  const savedIds = data ?? [];

  const toggleMutation = useMutation({
    mutationFn: async ({ jobId, shouldSave }: ToggleSavedJobVars) => {
      if (!driverId) {
        throw new Error("Driver ID is required to toggle saved jobs.");
      }

      if (!shouldSave) {
        const { error } = await withTimeout(supabase
          .from("saved_jobs")
          .delete()
          .eq("driver_id", driverId)
          .eq("job_id", jobId), 15_000);
        if (error) throw error;
      } else {
        const { error } = await withTimeout(supabase
          .from("saved_jobs")
          .insert({ driver_id: driverId, job_id: jobId }), 15_000);
        if (error) throw error;
      }
    },
    onMutate: async ({ jobId, shouldSave }) => {
      await qc.cancelQueries({ queryKey: key });
      const previousSavedIds = qc.getQueryData<string[]>(key) ?? [];

      qc.setQueryData<string[]>(key, (prev) => {
        const current = prev ?? [];
        if (shouldSave) {
          if (current.includes(jobId)) return current;
          return [jobId, ...current];
        }
        return current.filter((id) => id !== jobId);
      });

      return { previousSavedIds };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      qc.setQueryData(key, context.previousSavedIds);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });

  return {
    savedIds,
    isLoading,
    isSaved: (id: string) => savedIds.includes(id),
    toggle: (jobId: string) => {
      const currentSavedIds = qc.getQueryData<string[]>(key) ?? savedIds;
      const shouldSave = !currentSavedIds.includes(jobId);
      return toggleMutation.mutateAsync({ jobId, shouldSave });
    },
  };
}
