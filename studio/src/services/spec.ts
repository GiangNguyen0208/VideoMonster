import type {
  RenderView,
  RequirementsView,
  SpecDecisionInput,
  SpecFlow,
  SpecView,
  StudioDecision,
} from "@/types/api";
import { v1 } from "./endpoints";
import { api } from "./http";

export const getSpecFlow = (projectId: string) => api<SpecFlow>(v1.project(projectId).specFlow);
export const getRequirements = (projectId: string) =>
  api<RequirementsView>(v1.project(projectId).requirements);
export const getSpec = (projectId: string) => api<SpecView>(v1.project(projectId).spec);
export const getRender = (projectId: string) => api<RenderView>(v1.project(projectId).render);

export const decideRequirements = (projectId: string, input: SpecDecisionInput) =>
  api<StudioDecision>(v1.project(projectId).requirementsDecision, { json: input });
export const decideSpec = (projectId: string, input: SpecDecisionInput) =>
  api<StudioDecision>(v1.project(projectId).specDecision, { json: input });

/** Start the Gemini worker for the approved spec (202). */
export const startRender = (projectId: string) =>
  api<{ job: { id: string } }>(v1.project(projectId).render, { json: {} });
