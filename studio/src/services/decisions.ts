import type { DecisionInput, StudioDecision } from "@/types/api";
import { v1 } from "./endpoints";
import { api } from "./http";

export const listDecisions = (projectId: string) =>
  api<{ decisions: StudioDecision[] }>(v1.project(projectId).decisions);

export const submitDecision = (projectId: string, input: DecisionInput) =>
  api<StudioDecision>(v1.project(projectId).decisions, { json: input });

/** Take back a pending decision; 409 `already_consumed` once the agent applied it. */
export const retractDecision = (projectId: string, decisionId: string) =>
  api<null>(v1.project(projectId).decision(decisionId), { method: "DELETE" });
