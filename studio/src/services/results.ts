import type { ProjectCost, Results, SpendSummary } from "@/types/api";
import { v1 } from "./endpoints";
import { api } from "./http";

export const getResults = (projectId: string) => api<Results>(v1.project(projectId).results);

export const getProjectCost = (projectId: string) => api<ProjectCost>(v1.project(projectId).cost);

export const getSpendSince = (since: string) => api<SpendSummary>(v1.costSummary(since));

/** Download URL of the agent's export (single file, or the folder as a zip). */
export const exportUrl = (projectId: string) => v1.project(projectId).export;
