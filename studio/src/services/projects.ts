import type { BoardState, CreatedProject, IntakeInput, Kickoff, ProjectSummary } from "@/types/api";
import { board, v1 } from "./endpoints";
import { api, ApiError } from "./http";

export const listProjects = () => api<ProjectSummary[]>(board.projects);

export const getBoardState = (projectId: string) => api<BoardState>(board.state(projectId));

export const createProject = (intake: IntakeInput) =>
  api<CreatedProject>(v1.projects, { json: intake });

/** Kickoff commands; 404 (not a Studio project) resolves to null. */
export const getKickoff = (projectId: string) =>
  api<Kickoff>(v1.project(projectId).kickoff).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });

/** The saved brief and whether it can still change (no checkpoint yet). */
export const getIntake = (projectId: string) =>
  api<{ intake: Record<string, unknown>; editable: boolean }>(v1.project(projectId).intake);

export const updateIntake = (projectId: string, patch: Partial<IntakeInput>) =>
  api<{ intake: Record<string, unknown>; editable: boolean }>(v1.project(projectId).intake, {
    method: "PATCH",
    json: patch,
  });
