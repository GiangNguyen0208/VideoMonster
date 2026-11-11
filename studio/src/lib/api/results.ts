import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { queryKeys } from "./queries";

export interface ResultRender {
  path: string;
  name: string;
  size: number;
  mtime: number;
  /** `render_report.outputs[].platform_target`, when the agent wrote one. */
  label: string | null;
  resolution: string | null;
  duration_s: number | null;
  fps: number | null;
  in_report: boolean;
}

export interface PublishText {
  source: "publish_log" | "project";
  platform: string | null;
  title: string | null;
  description: string | null;
  hashtags: string[];
}

export interface ExportInfo {
  kind: "file" | "folder";
  name: string;
  files: number;
  size: number;
  platform: string | null;
}

export interface Results {
  renders: ResultRender[];
  publish: PublishText;
  export: ExportInfo | null;
}

export type CostStatus = "estimated" | "reserved" | "completed" | "failed" | "refunded";

export interface CostRow {
  spent_usd: number;
  reserved_usd: number;
  count: number;
}

export interface CostEntry {
  id: string;
  tool: string;
  operation: string | null;
  status: CostStatus;
  estimated_usd: number;
  reserved_usd: number;
  actual_usd: number;
  timestamp: string | null;
  stage: string | null;
  details: string | null;
}

export interface ProjectCost {
  has_log: boolean;
  budget_total_usd: number | null;
  budget_mode: "observe" | "warn" | "cap";
  snapshot: {
    total_spent_usd: number;
    total_reserved_usd: number;
    budget_remaining_usd: number | null;
  } | null;
  /** `free`: never priced above $0 — a local tool. */
  by_tool: (CostRow & { tool: string; free: boolean })[];
  by_stage: (CostRow & { stage: string | null })[];
  by_status: Partial<Record<CostStatus, { count: number; usd: number }>>;
  entries: CostEntry[];
}

export interface StudioSettings {
  budget: {
    mode: "observe" | "warn" | "cap";
    total_usd: number;
    single_action_approval_usd: number;
    require_approval_for_new_paid_tool: boolean;
  };
  checkpoint: { policy: "guided" | "manual_all" | "auto_noncreative" };
  output: { default_resolution: string; default_fps: number };
}

export interface SettingsView {
  settings: StudioSettings;
  choices: { resolutions: string[]; fps: number[] };
}

const project = (id: string) => `/api/v1/projects/${encodeURIComponent(id)}`;

export function exportUrl(projectId: string) {
  return `${project(projectId)}/export`;
}

export function useResults(projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.results(projectId),
    queryFn: () => api<Results>(`${project(projectId)}/results`),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useProjectCost(projectId: string) {
  return useQuery({
    queryKey: queryKeys.cost(projectId),
    queryFn: () => api<ProjectCost>(`${project(projectId)}/cost`),
    enabled: Boolean(projectId),
  });
}

/** Start of the current month in the user's time zone. */
export function monthStart(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export function useMonthSpend() {
  const since = monthStart();
  return useQuery({
    queryKey: [...queryKeys.projects, "month-spend", since],
    queryFn: () =>
      api<{ since: string; spent_usd: number; projects: number }>(
        `/api/v1/cost/summary?since=${encodeURIComponent(since)}`,
      ),
  });
}

export const settingsKey = ["settings"] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: () => api<SettingsView>("/api/v1/settings") });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: StudioSettings) =>
      api<SettingsView>("/api/v1/settings", { method: "PUT", json: settings }),
    onSuccess: (view) => queryClient.setQueryData(settingsKey, view),
  });
}
