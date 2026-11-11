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

/** `GET /api/v1/cost/summary` response. */
export interface SpendSummary {
  since: string;
  spent_usd: number;
  projects: number;
}
