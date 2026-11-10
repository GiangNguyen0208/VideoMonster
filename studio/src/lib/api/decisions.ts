import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { queryKeys } from "./queries";

export type DecisionAction = "approve" | "revise" | "abort";
export type DecisionState = "pending" | "consumed" | "stale";

export interface ProposalPicks {
  selected_concept_id?: string | null;
  approved_budget_usd?: number | null;
  render_runtime?: "remotion" | "hyperframes" | "ffmpeg" | null;
  composition_mode?: "templated" | "atelier" | null;
  music_source?: "user_library" | "ai_generated" | "bring_your_own" | "none" | null;
  /** Track from music_library/ when music_source is "user_library". */
  music_track?: string | null;
  voice?: string | null;
}

export interface DecisionInput {
  stage: string;
  checkpoint_timestamp: string;
  action: DecisionAction;
  notes: string;
  proposal?: ProposalPicks | null;
}

export interface StudioDecision extends DecisionInput {
  schema: "studio.decision/1";
  id: string;
  created_at: string;
  source: "studio";
  state: DecisionState;
}

const url = (projectId: string) => `/api/v1/projects/${encodeURIComponent(projectId)}/decisions`;

/** Studio decisions for a project; refreshed by the project SSE stream. */
export function useDecisions(projectId: string) {
  return useQuery({
    queryKey: queryKeys.decisions(projectId),
    queryFn: () => api<{ decisions: StudioDecision[] }>(url(projectId)),
    select: (d) => d.decisions,
    enabled: Boolean(projectId),
  });
}

export function useSubmitDecision(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DecisionInput) => api<StudioDecision>(url(projectId), { json: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.decisions(projectId) }),
  });
}

export function useRetractDecision(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decisionId: string) =>
      api<null>(`${url(projectId)}/${encodeURIComponent(decisionId)}`, { method: "DELETE" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.decisions(projectId) }),
  });
}
