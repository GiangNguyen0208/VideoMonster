import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDecisions, retractDecision, submitDecision } from "@/services";
import type { DecisionInput } from "@/types/api";
import { queryKeys } from "./queryKeys";

/** Studio decisions for a project; refreshed by the project SSE stream. */
export function useDecisions(projectId: string) {
  return useQuery({
    queryKey: queryKeys.decisions(projectId),
    queryFn: () => listDecisions(projectId),
    select: (d) => d.decisions,
    enabled: Boolean(projectId),
  });
}

export function useSubmitDecision(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DecisionInput) => submitDecision(projectId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.decisions(projectId) }),
  });
}

export function useRetractDecision(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decisionId: string) => retractDecision(projectId, decisionId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.decisions(projectId) }),
  });
}
