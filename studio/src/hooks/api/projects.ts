import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { board, createProject, getBoardState, getKickoff, listProjects } from "@/services";
import type { IntakeInput } from "@/types/api";
import { queryKeys } from "./queryKeys";
import { useSSE } from "./useSSE";

/** Library summaries, kept live by the library SSE stream. */
export function useProjects() {
  // Prefix match: also refreshes the month-to-date spend.
  useSSE(board.libraryEvents, [queryKeys.projects]);
  return useQuery({ queryKey: queryKeys.projects, queryFn: listProjects });
}

/** Full board state for one project, kept live by its SSE stream. */
export function useProject(projectId: string) {
  // Decision files and uploads live in the project folder too, so the same
  // stream tells us when the agent consumed one or a file landed.
  useSSE(projectId ? board.projectEvents(projectId) : null, [
    queryKeys.project(projectId),
    queryKeys.decisions(projectId),
    queryKeys.inputs(projectId),
    queryKeys.results(projectId),
    queryKeys.cost(projectId),
  ]);
  return useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => getBoardState(projectId),
    enabled: Boolean(projectId),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (intake: IntakeInput) => createProject(intake),
    onSuccess: ({ project_id, kickoff }) => {
      queryClient.setQueryData(queryKeys.kickoff(project_id), { ...kickoff, started: false });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

/** Kickoff commands; null when the project was not created in Studio. */
export function useKickoff(projectId: string) {
  return useQuery({
    queryKey: queryKeys.kickoff(projectId),
    queryFn: () => getKickoff(projectId),
    staleTime: Infinity,
  });
}
