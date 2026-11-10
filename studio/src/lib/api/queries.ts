import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { BoardState, ProjectSummary } from "./types";
import { useSSE } from "./useSSE";

export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  decisions: (id: string) => ["decisions", id] as const,
  inputs: (id: string) => ["inputs", id] as const,
};

/** Library summaries, kept live by the library SSE stream. */
export function useProjects() {
  useSSE("/api/library/events", [queryKeys.projects]);
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api<ProjectSummary[]>("/api/projects"),
  });
}

/** Full board state for one project, kept live by its SSE stream. */
export function useProject(projectId: string) {
  const enc = encodeURIComponent(projectId);
  // Decision files and uploads live in the project folder too, so the same
  // stream tells us when the agent consumed one or a file landed.
  useSSE(projectId ? `/api/project/${enc}/events` : null, [
    queryKeys.project(projectId),
    queryKeys.decisions(projectId),
    queryKeys.inputs(projectId),
  ]);
  return useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => api<BoardState>(`/api/project/${enc}/state`),
    enabled: Boolean(projectId),
  });
}
