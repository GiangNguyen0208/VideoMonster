import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, ApiError } from "./client";
import { queryKeys } from "./queries";
import { setupKeys, useJob, type Job, type VideoTypeState } from "./setup";

export interface PipelineInfo {
  name: string;
  description: string;
  category: string | null;
  stability: string | null;
  stages: { name: string; gated: boolean }[];
  reference_input: boolean;
  compatible_playbooks: { recommended: string[]; also_works: string[]; custom_allowed: boolean };
  production_modes: { name: string; description: string }[];
  budget_default_usd: number | null;
  default_checkpoint_policy: string | null;
  availability: {
    state: VideoTypeState;
    missing_required: string[];
    missing_enhancements: string[];
  } | null;
}

export interface CatalogDefaults {
  mode: string;
  total_usd: number | null;
  checkpoint_policy: string;
}

export interface PipelinesResponse {
  pipelines: PipelineInfo[];
  checked: boolean;
  defaults: CatalogDefaults;
}

export interface StyleInfo {
  name: string;
  title: string;
  mood: string | null;
  best_for: string | null;
  palette: string[];
  custom: boolean;
}

export type Platform = "youtube" | "shorts" | "linkedin" | "other";
export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";

/** Body of POST /api/v1/projects — `studio.intake/1` minus server-set fields. */
export interface IntakeInput {
  title: string;
  goal: string;
  pipeline_type: string;
  brief: {
    topic: string;
    audience: string;
    platform: Platform;
    aspect: Aspect;
    duration_seconds: number;
    tone: string;
    must_include: string[];
    avoid: string[];
    target_languages: string[];
  };
  style_playbook: string | null;
  budget: { cap_usd: number; mode: "observe" | "warn" | "cap" };
  reference: { url: string | null; notes: string | null };
  advanced: {
    render_runtime_preference: "remotion" | "hyperframes" | null;
    composition_mode_preference: "templated" | "atelier" | null;
    checkpoint_policy: "guided" | "manual_all" | null;
    production_mode: string | null;
  };
  music_track: string | null;
  language: string;
}

export interface KickoffAgent {
  id: string;
  label: string;
  command: string;
  note: string;
}

export interface Kickoff {
  project_id: string;
  request: string;
  agents: KickoffAgent[];
  started?: boolean;
}

export interface Demo {
  name: string;
  title: string;
  description: string;
  rendered: boolean;
  video_url: string | null;
  job: Job | null;
}

export const catalogKeys = {
  pipelines: ["catalog", "pipelines"] as const,
  styles: ["catalog", "styles"] as const,
  kickoff: (id: string) => ["kickoff", id] as const,
  demos: ["demos"] as const,
};

/**
 * Video types with lock state. The server starts the capability check on the
 * first call and answers `checked: false` until it finishes, so poll until
 * the lock badges can be filled in.
 */
export function usePipelines() {
  return useQuery({
    queryKey: catalogKeys.pipelines,
    queryFn: () => api<PipelinesResponse>("/api/v1/pipelines"),
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data && !q.state.data.checked ? 2000 : false),
  });
}

export function useStyles() {
  return useQuery({
    queryKey: catalogKeys.styles,
    queryFn: () => api<{ styles: StyleInfo[] }>("/api/v1/styles"),
    staleTime: 5 * 60_000,
    select: (d) => d.styles,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (intake: IntakeInput) =>
      api<{ project_id: string; kickoff: Kickoff }>("/api/v1/projects", { json: intake }),
    onSuccess: ({ project_id, kickoff }) => {
      queryClient.setQueryData(catalogKeys.kickoff(project_id), { ...kickoff, started: false });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

/** Kickoff commands; 404 (not a Studio project) resolves to null. */
export function useKickoff(projectId: string) {
  return useQuery({
    queryKey: catalogKeys.kickoff(projectId),
    queryFn: () =>
      api<Kickoff>(`/api/v1/projects/${encodeURIComponent(projectId)}/kickoff`).catch(
        (err: unknown) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        },
      ),
    staleTime: Infinity,
  });
}

export function useDemos() {
  return useQuery({
    queryKey: catalogKeys.demos,
    queryFn: () => api<{ demos: Demo[] }>("/api/v1/demos"),
    select: (d) => d.demos,
  });
}

/** Start a demo render (or follow one already running) and poll its job. */
export function useDemoRender(demo: Demo) {
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: () =>
      api<{ job: Job }>(`/api/v1/demos/${encodeURIComponent(demo.name)}/render`, {
        method: "POST",
      }),
    onSuccess: ({ job }) => queryClient.setQueryData(setupKeys.job(job.id), job),
  });
  const jobId = start.data?.job.id ?? demo.job?.id ?? null;
  const job = useJob(jobId);
  const succeeded = job.data?.status === "succeeded";
  useEffect(() => {
    if (succeeded) void queryClient.invalidateQueries({ queryKey: catalogKeys.demos });
  }, [succeeded, queryClient]);
  return { start, job: job.data ?? null };
}
