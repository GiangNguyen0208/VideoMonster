import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./client";

export interface Job {
  id: string;
  kind: string;
  status: "running" | "succeeded" | "failed";
  started_at: number;
  finished_at: number | null;
  error: string | null;
  /** 0..1 for jobs that report progress (demo renders). */
  progress?: number | null;
  /** Small result payload, e.g. `{ video_url }` for a demo render. */
  output?: Record<string, unknown> | null;
}

export type VideoTypeState = "ready" | "limited" | "locked";

export interface VideoTypeAvailability {
  pipeline: string;
  stability: string | null;
  state: VideoTypeState;
  missing_required: string[];
  missing_enhancements: string[];
}

export interface UnlockOffer {
  env_var: string;
  providers: string[];
  capabilities: string[];
  new_capabilities: string[];
  tools: string[];
  unlocks_video_types: string[];
  improves_video_types: string[];
  install_instructions: string;
  signup_url: string | null;
}

export interface KeyStatus {
  set: boolean;
  hint: string | null;
  source: "env_file" | "environment" | null;
}

export type Tier = "zero_key" | "starter" | "standard" | "full" | "full_gpu";

export interface SetupView {
  tier: Tier;
  tier_label: string;
  tier_explanation: string;
  runtimes: Record<string, boolean>;
  works_now: { capability: string; configured: number; total: number; providers: string[] }[];
  video_types: VideoTypeAvailability[];
  suggested_offers: UnlockOffer[];
  offers: UnlockOffer[];
  hardware: { tool: string; capability: string; provider: string; install_instructions: string }[];
  warnings: string[];
  keys: Record<string, KeyStatus>;
  checked_at: number | null;
  rechecking: Job | null;
}

type SetupResponse = SetupView | { status: "checking"; job: Job };

const isChecking = (r: SetupResponse | undefined): r is { status: "checking"; job: Job } =>
  Boolean(r && "status" in r && r.status === "checking");

export const setupKeys = {
  setup: ["setup"] as const,
  job: (id: string) => ["job", id] as const,
};

const JOB_POLL_MS = 1000;

/** Poll a background job until it finishes; returns its latest state. */
export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: setupKeys.job(jobId ?? ""),
    queryFn: () => api<Job>(`/api/v1/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (q) =>
      q.state.data?.status === "running" || !q.state.data ? JOB_POLL_MS : false,
  });
}

/**
 * Setup view. The first request may answer 202 while the capability check
 * runs (~5–10 s); this hook follows that job and then refetches the view.
 * A recheck started here is tracked the same way.
 */
export function useSetup() {
  const queryClient = useQueryClient();
  const setup = useQuery({
    queryKey: setupKeys.setup,
    queryFn: () => api<SetupResponse>("/api/v1/setup"),
    staleTime: Infinity,
  });

  const data = setup.data;
  const pendingJob = isChecking(data) ? data.job.id : (data?.rechecking?.id ?? null);
  const job = useJob(pendingJob);
  const finished = job.data && job.data.status !== "running" ? job.data : null;

  // A finished check (first load or recheck) means fresh data: refetch the view.
  const succeededId = finished?.status === "succeeded" ? finished.id : null;
  useEffect(() => {
    if (succeededId) void queryClient.invalidateQueries({ queryKey: setupKeys.setup });
  }, [succeededId, queryClient]);

  const recheck = useMutation({
    mutationFn: () => api<{ job: Job }>("/api/v1/setup/recheck", { method: "POST" }),
    onSuccess: ({ job: started }) => {
      queryClient.setQueryData(setupKeys.job(started.id), started);
      queryClient.setQueryData<SetupResponse>(setupKeys.setup, (prev) =>
        prev && !isChecking(prev)
          ? { ...prev, rechecking: started }
          : { status: "checking", job: started },
      );
    },
  });

  const view = data && !isChecking(data) ? data : null;
  const checking = Boolean(pendingJob) && finished === null;
  const failedJob = finished?.status === "failed" ? finished : null;

  return { setup, view, checking, failedJob, recheck };
}

export function useSaveKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api<KeyStatus & { key: string }>("/api/v1/setup/env", {
        method: "PUT",
        json: { key, value },
      }),
    onSuccess: (status) => {
      queryClient.setQueryData<SetupResponse>(setupKeys.setup, (prev) =>
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
