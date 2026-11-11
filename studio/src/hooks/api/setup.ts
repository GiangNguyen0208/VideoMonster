import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getJob, getSetup, recheckSetup, saveEnvKey } from "@/services";
import type { Job, SetupResponse } from "@/types/api";
import { queryKeys } from "./queryKeys";

const JOB_POLL_MS = 1000;

const isChecking = (r: SetupResponse | undefined): r is { status: "checking"; job: Job } =>
  Boolean(r && "status" in r && r.status === "checking");

/** Poll a background job until it finishes; returns its latest state. */
export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: queryKeys.job(jobId ?? ""),
    queryFn: () => getJob(jobId ?? ""),
    enabled: Boolean(jobId),
    refetchInterval: (q) =>
      q.state.data?.status === "running" || !q.state.data ? JOB_POLL_MS : false,
  });
}

/** Start a fresh capability check; the setup view keeps showing until it ends. */
export function useRecheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recheckSetup,
    onSuccess: ({ job: started }) => {
      queryClient.setQueryData(queryKeys.job(started.id), started);
      queryClient.setQueryData<SetupResponse>(queryKeys.setup, (prev) =>
        prev && !isChecking(prev)
          ? { ...prev, rechecking: started }
          : { status: "checking", job: started },
      );
    },
  });
}

/**
 * Setup view. The first request may answer 202 while the capability check
 * runs (~5–10 s); this hook follows that job and then refetches the view.
 * A recheck started here is tracked the same way.
 */
export function useSetup() {
  const queryClient = useQueryClient();
  const setup = useQuery({ queryKey: queryKeys.setup, queryFn: getSetup, staleTime: Infinity });

  const data = setup.data;
  const pendingJob = isChecking(data) ? data.job.id : (data?.rechecking?.id ?? null);
  const job = useJob(pendingJob);
  const finished = job.data && job.data.status !== "running" ? job.data : null;

  // A finished check (first load or recheck) means fresh data: refetch the view.
  const succeededId = finished?.status === "succeeded" ? finished.id : null;
  useEffect(() => {
    if (succeededId) void queryClient.invalidateQueries({ queryKey: queryKeys.setup });
  }, [succeededId, queryClient]);

  const recheck = useRecheck();

  const view = data && !isChecking(data) ? data : null;
  const checking = Boolean(pendingJob) && finished === null;
  const failedJob = finished?.status === "failed" ? finished : null;

  return { setup, view, checking, failedJob, recheck };
}

export function useSaveKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => saveEnvKey(key, value),
    onSuccess: (status) => {
      queryClient.setQueryData<SetupResponse>(queryKeys.setup, (prev) =>
        prev && !isChecking(prev)
          ? {
              ...prev,
              keys: {
                ...prev.keys,
                [status.key]: { set: status.set, hint: status.hint, source: status.source },
              },
            }
          : prev,
      );
    },
  });
}
