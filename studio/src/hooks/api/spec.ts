import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideRequirements,
  decideSpec,
  getRender,
  getRequirements,
  getSpec,
  getSpecFlow,
  startRender,
} from "@/services";
import type { SpecDecisionInput } from "@/types/api";
import { queryKeys } from "./queryKeys";

/** How often render progress is re-read while the worker runs (the job lives in memory, not in files). */
export const RENDER_POLL_MS = 2000;

/** Stepper state derived from the project's files; kept live by the project SSE stream. */
export function useSpecFlow(projectId: string) {
  return useQuery({
    queryKey: queryKeys.specFlow(projectId),
    queryFn: () => getSpecFlow(projectId),
    enabled: Boolean(projectId),
  });
}

export function useRequirements(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.requirements(projectId),
    queryFn: () => getRequirements(projectId),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useSpecView(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.spec(projectId),
    queryFn: () => getSpec(projectId),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useRenderView(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.render(projectId),
    queryFn: () => getRender(projectId),
    enabled: Boolean(projectId) && enabled,
    refetchInterval: (q) => (q.state.data?.state === "running" ? RENDER_POLL_MS : false),
  });
}

/** Answer a gate. `stage` picks the endpoint; both return the recorded decision. */
export function useSpecDecision(projectId: string, stage: "requirements" | "spec") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SpecDecisionInput) =>
      stage === "requirements"
        ? decideRequirements(projectId, input)
        : decideSpec(projectId, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.specAll(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.decisions(projectId) });
    },
  });
}

export function useStartRender(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startRender(projectId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.specAll(projectId) }),
  });
}
